namespace Cashless.Api.Endpoints;

using Cashless.Api.Data;
using Cashless.Api.Dtos.Barra;
using Cashless.Api.Models;
using Cashless.Api.Services.Auth;
using Cashless.Api.Services.Infra;
using Microsoft.EntityFrameworkCore;

public static class PosEndpoints
{
    public static WebApplication MapPosEndpoints(this WebApplication app)
    {
        app.MapPost("/uid", (UidRequest req, IUidState uidState) =>
        {
            var uid = (req.uid ?? "").Trim().ToUpperInvariant();
            uidState.SetLastUid(uid);
            Console.WriteLine($"UID leÃ­do: {uid}");
            return Results.Ok(new { ok = true });
        });

        app.MapGet("/last-uid", (IUidState uidState) =>
        {
            // Nunca 404 para no spamear consola del dashboard.
            // Si no hay UID, devolvemos uid vacÃ­o.
            if (!uidState.TryTakeLastUid(out var uid))
                return Results.Ok(new { uid = "" });

            return Results.Ok(new { uid });
        });

        app.MapGet("/balance/{uid}", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, string uid) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var clean = (uid ?? "").Trim().ToUpperInvariant();

            var card = await db.Cards
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.Uid == clean && c.TenantId == tenantId && c.User.TenantId == tenantId);

            if (card is null) return Results.NotFound(new { message = "Pulsera no asignada" });

            return Results.Ok(new
            {
                userName = card.User.Name,
                balance = card.User.Balance
            });
        });

        app.MapPost("/topup", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, TopupRequest req) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var uid = (req.Uid ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(uid)) return Results.BadRequest(new { message = "UID requerido" });
            if (req.Amount <= 0) return Results.BadRequest(new { message = "Monto invÃ¡lido" });

            var card = await db.Cards.Include(c => c.User).FirstOrDefaultAsync(c => c.Uid == uid && c.TenantId == tenantId && c.User.TenantId == tenantId);
            if (card is null) return Results.NotFound(new { message = "Pulsera no asignada" });

            card.User.Balance += req.Amount;

            db.Transactions.Add(new Transaction
            {
                UserId = card.User.Id,
                CardUid = card.Uid,
                Amount = req.Amount,
                Type = TransactionType.TopUp,
                CreatedAt = DateTime.UtcNow,
                TenantId = tenantId,
                OperatorId = op.Id,
                AreaId = op.AreaId
            });

            await db.SaveChangesAsync();
            return Results.Ok(new { newBalance = card.User.Balance });
        });

        app.MapPost("/charge", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, IUidState uidState, ChargeRequest req) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var uid = (req.Uid ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(uid)) return Results.BadRequest(new { message = "UID requerido" });
            if (req.Amount <= 0) return Results.BadRequest(new { message = "Monto invÃ¡lido" });

            // ?? solo 1 cobro por lectura
            if (!uidState.ConsumePendingIfMatches(uid))
                return Results.BadRequest(new { message = "Esta pulsera ya fue usada o no fue leÃ­da recientemente" });

            var card = await db.Cards.Include(c => c.User).FirstOrDefaultAsync(c => c.Uid == uid && c.TenantId == tenantId && c.User.TenantId == tenantId);
            if (card is null) return Results.NotFound(new { message = "Pulsera no asignada" });

            if (card.User.Balance < req.Amount)
                return Results.BadRequest(new { message = "Saldo insuficiente" });

            card.User.Balance -= req.Amount;
            card.User.TotalSpent += req.Amount;

            db.Transactions.Add(new Transaction
            {
                UserId = card.User.Id,
                CardUid = uid,
                Amount = req.Amount,
                Type = TransactionType.Charge,
                CreatedAt = DateTime.UtcNow,
                TenantId = tenantId,
                OperatorId = op.Id,
                AreaId = op.AreaId
            });

            await db.SaveChangesAsync();
            return Results.Ok(new { newBalance = card.User.Balance });
        });

        // =======================
        // PROTEGIDO: Charge V2 (propina + donaciÃ³n + items) + datos para reportes
        // - No rompe esquema: guarda "items/tip/donation" dentro de Transaction.Note (JSON)
        // - Crea 1 tx de SUBTOTAL + 1 tx de TIP (si aplica) + 1 tx de DONATION (si aplica)
        // =======================

        app.MapPost("/charge-v2", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, IUidState uidState, ChargeRequestV2 req) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var uid = (req.Uid ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(uid)) return Results.BadRequest(new { message = "UID requerido" });
            if (req.AreaId <= 0) return Results.BadRequest(new { message = "AreaId invÃ¡lido" });
            if (req.OperatorId <= 0) return Results.BadRequest(new { message = "OperatorId invÃ¡lido" });
            if (req.Items is null || req.Items.Count == 0) return Results.BadRequest(new { message = "Items requerido" });

            if (req.TipAmount < 0) return Results.BadRequest(new { message = "TipAmount invÃ¡lido" });
            if (req.DonationPercent < 0 || req.DonationPercent > 100) return Results.BadRequest(new { message = "DonationPercent invÃ¡lido (0-100)" });

            // ?? solo 1 cobro por lectura
            if (!uidState.ConsumePendingIfMatches(uid))
                return Results.BadRequest(new { message = "Esta pulsera ya fue usada o no fue leÃ­da recientemente" });

            var card = await db.Cards.Include(c => c.User).FirstOrDefaultAsync(c => c.Uid == uid && c.TenantId == tenantId && c.User.TenantId == tenantId);
            if (card is null) return Results.NotFound(new { message = "Pulsera no asignada" });

            // Trae menÃº del Ã¡rea para precio efectivo (override o base)
            var menu = await db.AreaProducts
                .Include(ap => ap.Product)
                .Where(ap => ap.AreaId == req.AreaId && ap.IsActive && ap.Product.IsActive && ap.TenantId == tenantId && ap.Product.TenantId == tenantId)
                .ToListAsync();

            var priceByProductId = menu.ToDictionary(
                ap => ap.ProductId,
                ap => (ap.PriceOverride ?? ap.Product.Price)
            );

            // Calcula subtotal y arma items para auditorÃ­a + reportes
            decimal subtotal = 0m;
            var noteItems = new List<object>();

            foreach (var it in req.Items)
            {
                if (it.Qty <= 0) return Results.BadRequest(new { message = "Qty invÃ¡lido" });

                if (!priceByProductId.TryGetValue(it.ProductId, out var unit))
                    return Results.BadRequest(new { message = $"Producto {it.ProductId} no estÃ¡ activo en el menÃº del Ã¡rea {req.AreaId}" });

                var line = unit * it.Qty;
                subtotal += line;

                var name = menu.First(ap => ap.ProductId == it.ProductId).Product.Name;

                noteItems.Add(new
                {
                    productId = it.ProductId,
                    name,
                    qty = it.Qty,
                    unitPrice = unit,
                    lineTotal = line
                });
            }

            var donationAmount = req.DonationPercent > 0 ? Math.Round(subtotal * (req.DonationPercent / 100m), 2) : 0m;
            var tipAmount = Math.Round(req.TipAmount, 2);

            var grandTotal = subtotal + tipAmount + donationAmount;
            if (grandTotal <= 0) return Results.BadRequest(new { message = "Monto invÃ¡lido" });

            if (card.User.Balance < grandTotal)
                return Results.BadRequest(new { message = "Saldo insuficiente" });

            // Aplica cargo al usuario
            card.User.Balance -= grandTotal;
            card.User.TotalSpent += grandTotal;

            // 1) SUBTOTAL
            var saleMeta = new
            {
                kind = "SALE_SUBTOTAL",
                areaId = req.AreaId,
                operatorId = req.OperatorId,
                subtotal,
                items = noteItems
            };
            db.Transactions.Add(new Transaction
            {
                UserId = card.User.Id,
                CardUid = uid,
                Amount = subtotal,
                TipAmount = 0m,
                Type = TransactionType.Charge,
                Note = System.Text.Json.JsonSerializer.Serialize(saleMeta),
                CreatedAt = DateTime.UtcNow,
                TenantId = tenantId,
                AreaId = req.AreaId,
                OperatorId = req.OperatorId
            });

            // 2) TIP
            if (tipAmount > 0)
            {
                var tipMeta = new { kind = "TIP", areaId = req.AreaId, operatorId = req.OperatorId, tipAmount };
                db.Transactions.Add(new Transaction
                {
                    UserId = card.User.Id,
                    CardUid = uid,
                    Amount = tipAmount,
                    TipAmount = tipAmount,
                    Type = TransactionType.Charge,
                    Note = System.Text.Json.JsonSerializer.Serialize(tipMeta),
                    CreatedAt = DateTime.UtcNow,
                    TenantId = tenantId,
                    AreaId = req.AreaId,
                    OperatorId = req.OperatorId
                });
            }

            // 3) DONATION
            if (donationAmount > 0)
            {
                var donMeta = new
                {
                    kind = "DONATION",
                    areaId = req.AreaId,
                    operatorId = req.OperatorId,
                    donationPercent = req.DonationPercent,
                    donationAmount,
                    donationProjectId = req.DonationProjectId
                };
                db.Transactions.Add(new Transaction
                {
                    UserId = card.User.Id,
                    CardUid = uid,
                    Amount = donationAmount,
                    TipAmount = 0m,
                    Type = TransactionType.Charge,
                    Note = System.Text.Json.JsonSerializer.Serialize(donMeta),
                    CreatedAt = DateTime.UtcNow,
                    TenantId = tenantId,
                    AreaId = req.AreaId,
                    OperatorId = req.OperatorId,
                    DonationProjectId = req.DonationProjectId
                });
            }

            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                ok = true,
                uid,
                subtotal,
                tipAmount,
                donationAmount,
                grandTotal,
                newBalance = card.User.Balance
            });
        });

        return app;
    }
}













