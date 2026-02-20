namespace Cashless.Api.Endpoints;

using Cashless.Api.Data;
using Cashless.Api.Models;
using Cashless.Api.Services.Auth;
using Microsoft.EntityFrameworkCore;

public static class ReportsEndpoints
{
    public static WebApplication MapReportsEndpoints(this WebApplication app)
    {
        app.MapGet("/api/reports1/summary", async (CashlessContext db, HttpRequest req, IAuthService auth,
            string? from, string? to, int? areaId) =>
        {
            var op = await auth.AuthenticateAsync(db, req);
            if (op is null) return Results.Unauthorized();

            // rango
            var fromDt = DateTime.TryParse(from, out var f) ? f.Date : DateTime.Today.AddDays(-6);
            var toDt   = DateTime.TryParse(to, out var t) ? t.Date.AddDays(1) : DateTime.Today.AddDays(1);

            // ?? OJO: ajusta nombres si tus entidades difieren:
            // Ventas: idealmente desde Sales (si existe)
            var salesQ = db.Sales.AsQueryable()
                .Where(s => s.CreatedAt >= fromDt && s.CreatedAt < toDt);

            if (areaId.HasValue) salesQ = salesQ.Where(s => s.AreaId == areaId.Value);

            var totalVendido = await salesQ.SumAsync(s => (decimal?)s.Total) ?? 0m;
            var totalPropina = await salesQ.SumAsync(s => (decimal?)s.TipAmount) ?? 0m;
            var totalDonacion = await salesQ.SumAsync(s => (decimal?)s.DonationAmount) ?? 0m;
            var txCount = await salesQ.CountAsync();

            var userCount = await db.Users.CountAsync(); // total usuarios

            return Results.Ok(new {
                from = fromDt.ToString("yyyy-MM-dd"),
                to = toDt.AddDays(-1).ToString("yyyy-MM-dd"),
                totalVendido,
                totalPropina,
                totalDonacion,
                transacciones = txCount,
                usuarios = userCount,
                ticketPromedio = txCount > 0 ? totalVendido / txCount : 0m
            });
        });

        app.MapGet("/api/reports1/top-products", async (CashlessContext db, HttpRequest req, IAuthService auth,
            string? from, string? to, int? areaId, int? take) =>
        {
            var op = await auth.AuthenticateAsync(db, req);
            if (op is null) return Results.Unauthorized();

            var fromDt = DateTime.TryParse(from, out var f) ? f.Date : DateTime.Today.AddDays(-6);
            var toDt   = DateTime.TryParse(to, out var t) ? t.Date.AddDays(1) : DateTime.Today.AddDays(1);
            var limit = (take.HasValue && take.Value > 0 && take.Value <= 50) ? take.Value : 10;

            // ?? Top productos desde SaleItems (ajusta nombres si difieren)
            var q = db.SaleItems
                .Where(i => i.Sale.CreatedAt >= fromDt && i.Sale.CreatedAt < toDt);

            if (areaId.HasValue) q = q.Where(i => i.Sale.AreaId == areaId.Value);

            var rows = await q
                .GroupBy(i => new { i.ProductId, i.Product.Name })
                .Select(g => new {
                    productId = g.Key.ProductId,
                    name = g.Key.Name,
                    qty = g.Sum(x => x.Qty),
                    amount = g.Sum(x => x.LineTotal)
                })
                .OrderByDescending(x => x.qty)
                .ThenByDescending(x => x.amount)
                .Take(limit)
                .ToListAsync();

            return Results.Ok(rows);
        });

        // =======================
        // PROTEGIDO: REPORTES (server-side)
        // - summary: total vendido, propina, donación, usuarios, transacciones
        // - top-products: agrega por items guardados en Transaction.Note (SALE_SUBTOTAL)
        // =======================

        app.MapGet("/api/reports/summary", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, string? from, string? to) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();

            var f = ParseDate(from) ?? DateTime.MinValue;
            var t = ParseDate(to, endOfDay: true) ?? DateTime.MaxValue;

            var userCount = await db.Users.CountAsync();

            var q = db.Transactions.Where(x => x.CreatedAt >= f && x.CreatedAt <= t);

            var txCount = await q.CountAsync();

            // Total vendido (incluye tip/donación) = suma de cargos
            var totalCharged = await q.Where(x => x.Type == TransactionType.Charge).SumAsync(x => (decimal?)x.Amount) ?? 0m;

            // Separaciones por kind en Note
            // Tip: como Note es JSON, filtramos por Contains para no romper por provider Sqlite
            var totalTips = await q.Where(x => x.Type == TransactionType.Charge && x.Note != null && x.Note.Contains("\"kind\":\"TIP\""))
                .SumAsync(x => (decimal?)x.Amount) ?? 0m;

            var totalDonations = await q.Where(x => x.Type == TransactionType.Charge && x.Note != null && x.Note.Contains("\"kind\":\"DONATION\""))
                .SumAsync(x => (decimal?)x.Amount) ?? 0m;

            var totalSalesSubtotal = await q.Where(x => x.Type == TransactionType.Charge && x.Note != null && x.Note.Contains("\"kind\":\"SALE_SUBTOTAL\""))
                .SumAsync(x => (decimal?)x.Amount) ?? 0m;

            return Results.Ok(new
            {
                from = f,
                to = t,
                userCount,
                txCount,
                totalSold = totalSalesSubtotal,     // “venta” sin tip/donación
                totalTips,
                totalDonations,
                totalCharged                        // venta+tip+donación (lo que realmente se descontó)
            });
        });

        app.MapGet("/api/reports/top-products", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, string? from, string? to, int take = 10) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();

            var f = ParseDate(from) ?? DateTime.MinValue;
            var t = ParseDate(to, endOfDay: true) ?? DateTime.MaxValue;

            // Trae transacciones con items guardados en Note (SALE_SUBTOTAL)
            var tx = await db.Transactions
                .Where(x => x.Type == TransactionType.Charge
                            && x.CreatedAt >= f && x.CreatedAt <= t
                            && x.Note != null
                            && x.Note.Contains("\"kind\":\"SALE_SUBTOTAL\""))
                .Select(x => new { x.Id, x.Note })
                .ToListAsync();

            var agg = new Dictionary<int, (string Name, int Qty, decimal Amount)>();

            foreach (var row in tx)
            {
                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(row.Note!);
                    if (!doc.RootElement.TryGetProperty("items", out var items) || items.ValueKind != System.Text.Json.JsonValueKind.Array)
                        continue;

                    foreach (var it in items.EnumerateArray())
                    {
                        if (!it.TryGetProperty("productId", out var pidEl)) continue;
                        var pid = pidEl.GetInt32();

                        var name = it.TryGetProperty("name", out var nEl) ? nEl.GetString() ?? $"Producto {pid}" : $"Producto {pid}";
                        var qty = it.TryGetProperty("qty", out var qEl) ? qEl.GetInt32() : 0;
                        var amt = it.TryGetProperty("lineTotal", out var aEl) ? aEl.GetDecimal() : 0m;

                        if (qty <= 0) continue;

                        if (!agg.TryGetValue(pid, out var prev))
                            agg[pid] = (name, qty, amt);
                        else
                            agg[pid] = (prev.Name, prev.Qty + qty, prev.Amount + amt);
                    }
                }
                catch { /* ignora notes corruptas */ }
            }

            var rows = agg
                .Select(kv => new { productId = kv.Key, name = kv.Value.Name, qty = kv.Value.Qty, amount = kv.Value.Amount })
                .OrderByDescending(x => x.qty)
                .ThenByDescending(x => x.amount)
                .Take(Math.Clamp(take, 1, 50))
                .ToList();

            return Results.Ok(new { from = f, to = t, items = rows });
        });

        // =======================
        // REPORTES (v2) - basado en Transactions (porque /charge guarda Transaction)
        // =======================
        app.MapGet("/api/reports2/summary", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, string? from, string? to) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();

            var fromDt = DateTime.TryParse(from, out var f) ? f.Date : DateTime.Today.AddDays(-6);
            var toDt = DateTime.TryParse(to, out var t) ? t.Date.AddDays(1) : DateTime.Today.AddDays(1); // exclusivo

            var chargesQ = db.Transactions
                .Where(x => x.Type == TransactionType.Charge && x.CreatedAt >= fromDt && x.CreatedAt < toDt);

            var totalVendido = await chargesQ.SumAsync(x => (decimal?)x.Amount) ?? 0m;
            var txCount = await chargesQ.CountAsync();
            var userCount = await db.Users.CountAsync();

            // OJO: propina/donación hoy NO se guardan en DB (tu /charge no las maneja),
            // así que por ahora regresan 0 hasta que implementemos ChargeRequestV2 y persistencia.
            var totalPropina = 0m;
            var totalDonacion = 0m;

            return Results.Ok(new
            {
                from = fromDt.ToString("yyyy-MM-dd"),
                to = toDt.AddDays(-1).ToString("yyyy-MM-dd"),
                totalVendido,
                totalPropina,
                totalDonacion,
                transacciones = txCount,
                usuarios = userCount,
                ticketPromedio = txCount > 0 ? totalVendido / txCount : 0m
            });
        });

        return app;
    }

    private static DateTime? ParseDate(string? s, bool endOfDay = false)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        if (!DateTime.TryParse(s, out var d)) return null;
        return endOfDay ? d.Date.AddDays(1).AddTicks(-1) : d.Date;
    }
}
