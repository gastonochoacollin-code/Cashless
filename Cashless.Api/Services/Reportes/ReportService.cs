namespace Cashless.Api.Services.Reportes;

using Cashless.Api.Data;
using Cashless.Api.Models;
using Microsoft.EntityFrameworkCore;

public sealed class ReportService : IReportService
{
    public async Task<Report1SummaryResult> GetReports1SummaryAsync(CashlessContext db, DateTime fromDt, DateTime toDt, int? areaId)
    {
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

        return new Report1SummaryResult(
            fromDt.ToString("yyyy-MM-dd"),
            toDt.AddDays(-1).ToString("yyyy-MM-dd"),
            totalVendido,
            totalPropina,
            totalDonacion,
            txCount,
            userCount,
            txCount > 0 ? totalVendido / txCount : 0m
        );
    }

    public async Task<List<Report1TopProductRow>> GetReports1TopProductsAsync(CashlessContext db, DateTime fromDt, DateTime toDt, int? areaId, int limit)
    {
        // ?? Top productos desde SaleItems (ajusta nombres si difieren)
        var q = db.SaleItems
            .Where(i => i.Sale.CreatedAt >= fromDt && i.Sale.CreatedAt < toDt);

        if (areaId.HasValue) q = q.Where(i => i.Sale.AreaId == areaId.Value);

        var rows = await q
            .GroupBy(i => new { i.ProductId, i.Product.Name })
            .Select(g => new Report1TopProductRow(
                g.Key.ProductId,
                g.Key.Name,
                g.Sum(x => x.Qty),
                g.Sum(x => x.LineTotal)
            ))
            .OrderByDescending(x => x.Qty)
            .ThenByDescending(x => x.Amount)
            .Take(limit)
            .ToListAsync();

        return rows;
    }

    public async Task<ReportSummaryResult> GetReportsSummaryAsync(CashlessContext db, DateTime from, DateTime to)
    {
        var userCount = await db.Users.CountAsync();

        var q = db.Transactions.Where(x => x.CreatedAt >= from && x.CreatedAt <= to);

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

        return new ReportSummaryResult(
            from,
            to,
            userCount,
            txCount,
            totalSalesSubtotal,
            totalTips,
            totalDonations,
            totalCharged
        );
    }

    public async Task<ReportTopProductsResult> GetReportsTopProductsAsync(CashlessContext db, DateTime from, DateTime to, int take)
    {
        // Trae transacciones con items guardados en Note (SALE_SUBTOTAL)
        var tx = await db.Transactions
            .Where(x => x.Type == TransactionType.Charge
                        && x.CreatedAt >= from && x.CreatedAt <= to
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
            .Select(kv => new ReportTopProductRow(kv.Key, kv.Value.Name, kv.Value.Qty, kv.Value.Amount))
            .OrderByDescending(x => x.Qty)
            .ThenByDescending(x => x.Amount)
            .Take(take)
            .ToList();

        return new ReportTopProductsResult(from, to, rows);
    }

    public async Task<Report2SummaryResult> GetReports2SummaryAsync(CashlessContext db, DateTime fromDt, DateTime toDt)
    {
        var chargesQ = db.Transactions
            .Where(x => x.Type == TransactionType.Charge && x.CreatedAt >= fromDt && x.CreatedAt < toDt);

        var totalVendido = await chargesQ.SumAsync(x => (decimal?)x.Amount) ?? 0m;
        var txCount = await chargesQ.CountAsync();
        var userCount = await db.Users.CountAsync();

        // OJO: propina/donación hoy NO se guardan en DB (tu /charge no las maneja),
        // así que por ahora regresan 0 hasta que implementemos ChargeRequestV2 y persistencia.
        var totalPropina = 0m;
        var totalDonacion = 0m;

        return new Report2SummaryResult(
            fromDt.ToString("yyyy-MM-dd"),
            toDt.AddDays(-1).ToString("yyyy-MM-dd"),
            totalVendido,
            totalPropina,
            totalDonacion,
            txCount,
            userCount,
            txCount > 0 ? totalVendido / txCount : 0m
        );
    }
}
