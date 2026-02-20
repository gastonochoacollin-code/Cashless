namespace Cashless.Api.Services.Reportes;

using Cashless.Api.Data;
using Cashless.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

public sealed class ReportService : IReportService
{
    private readonly ILogger<ReportService> _logger;

    public ReportService(ILogger<ReportService> logger)
    {
        _logger = logger;
    }

    public async Task<Report1SummaryResult> GetReports1SummaryAsync(CashlessContext db, int tenantId, DateTimeOffset fromDt, DateTimeOffset toDt, int? areaId)
    {
        var from = fromDt.UtcDateTime;
        var to = toDt.UtcDateTime;

        // ?? OJO: ajusta nombres si tus entidades difieren:
        // Ventas: idealmente desde Sales (si existe)
        var salesQ = db.Sales.AsQueryable()
            .Where(s => s.TenantId == tenantId && s.CreatedAt >= from && s.CreatedAt < to);

        if (areaId.HasValue) salesQ = salesQ.Where(s => s.AreaId == areaId.Value);

        var totalVendido = ToDecimal(await salesQ.SumAsync(s => (double?)s.Total));
        var totalPropina = ToDecimal(await salesQ.SumAsync(s => (double?)s.TipAmount));
        var totalDonacion = ToDecimal(await salesQ.SumAsync(s => (double?)s.DonationAmount));
        var txCount = await salesQ.CountAsync();

        var userCount = await db.Users.Where(u => u.TenantId == tenantId).CountAsync(); // total usuarios

        _logger.LogDebug("[reports1.summary] from={From} to={To} areaId={AreaId} txCount={TxCount} totalVendido={TotalVendido} totalPropina={TotalPropina} totalDonacion={TotalDonacion}",
            from, to, areaId, txCount, totalVendido, totalPropina, totalDonacion);

        return new Report1SummaryResult(
            from.ToString("yyyy-MM-dd"),
            to.AddDays(-1).ToString("yyyy-MM-dd"),
            totalVendido,
            totalPropina,
            totalDonacion,
            txCount,
            userCount,
            txCount > 0 ? totalVendido / txCount : 0m
        );
    }

    public async Task<List<Report1TopProductRow>> GetReports1TopProductsAsync(CashlessContext db, int tenantId, DateTimeOffset fromDt, DateTimeOffset toDt, int? areaId, int limit)
    {
        var from = fromDt.UtcDateTime;
        var to = toDt.UtcDateTime;

        // ?? Top productos desde SaleItems (ajusta nombres si difieren)
        var q = db.SaleItems
            .Where(i => i.TenantId == tenantId && i.Sale.CreatedAt >= from && i.Sale.CreatedAt < to);

        if (areaId.HasValue) q = q.Where(i => i.Sale.AreaId == areaId.Value);

        var rows = await q
            .GroupBy(i => new { i.ProductId, i.Product.Name })
            .Select(g => new
            {
                productId = g.Key.ProductId,
                name = g.Key.Name,
                qty = g.Sum(x => x.Qty),
                amount = g.Sum(x => (double?)x.LineTotal) ?? 0d
            })
            .OrderByDescending(x => x.qty)
            .ThenByDescending(x => x.amount)
            .Take(limit)
            .ToListAsync();

        _logger.LogDebug("[reports1.top-products] from={From} to={To} areaId={AreaId} take={Take} rows={Rows}",
            from, to, areaId, limit, rows.Count);

        return rows
            .Select(r => new Report1TopProductRow(r.productId, r.name, r.qty, ToDecimal(r.amount)))
            .ToList();
    }

    public async Task<ReportSummaryResult> GetReportsSummaryAsync(CashlessContext db, int tenantId, DateTimeOffset from, DateTimeOffset to)
    {
        var fromUtc = from.UtcDateTime;
        var toUtc = to.UtcDateTime;

        var userCount = await db.Users.Where(u => u.TenantId == tenantId).CountAsync();

        var chargesQ = db.Transactions
            .Where(x => x.TenantId == tenantId && x.Type == TransactionType.Charge && x.CreatedAt >= fromUtc && x.CreatedAt <= toUtc);

        var txCount = await chargesQ.CountAsync();

        // Total vendido = suma de cargos (mismo criterio que ventas por barra)
        var totalSold = ToDecimal(await chargesQ.SumAsync(x => (double?)x.Amount));

        // Propinas / donaciones si existen en la transacción
        var totalTips = ToDecimal(await chargesQ.SumAsync(x => (double?)x.TipAmount));
        var totalDonations = ToDecimal(await chargesQ.SumAsync(x => (double?)x.DonationAmount));

        // Total charged = total vendido (cargos) para mantener consistencia
        var totalCharged = totalSold;

        _logger.LogDebug("[reports.summary] from={From} to={To} txCount={TxCount} totalSold={TotalSold} totalTips={TotalTips} totalDonations={TotalDonations} totalCharged={TotalCharged}",
            fromUtc, toUtc, txCount, totalSold, totalTips, totalDonations, totalCharged);

        return new ReportSummaryResult(
            fromUtc,
            toUtc,
            userCount,
            txCount,
            totalSold,
            totalTips,
            totalDonations,
            totalCharged
        );
    }

    public async Task<ReportTopProductsResult> GetReportsTopProductsAsync(CashlessContext db, int tenantId, DateTimeOffset from, DateTimeOffset to, int take)
    {
        var fromUtc = from.UtcDateTime;
        var toUtc = to.UtcDateTime;

        var baseQuery = db.SaleItems
            .Where(i => i.TenantId == tenantId && i.Sale.CreatedAt >= fromUtc && i.Sale.CreatedAt <= toUtc);

        List<ReportTopProductRow> rows;

        try
        {
            var sqlRows = await baseQuery
                .GroupBy(i => i.Product.Name)
                .Select(g => new
                {
                    name = g.Key,
                    qty = g.Sum(x => x.Qty),
                    amount = g.Sum(x => (double)x.LineTotal)
                })
                .OrderByDescending(x => x.qty)
                .ThenByDescending(x => x.amount)
                .Take(take)
                .ToListAsync();

            rows = sqlRows
                .Select(r => new ReportTopProductRow(0, r.name, r.qty, (decimal)r.amount))
                .ToList();
        }
        catch
        {
            var list = await baseQuery
                .Select(i => new { name = i.Product.Name, qty = i.Qty, amount = i.LineTotal })
                .ToListAsync();

            rows = list
                .GroupBy(x => x.name)
                .Select(g => new ReportTopProductRow(
                    0,
                    g.Key,
                    g.Sum(x => x.qty),
                    g.Sum(x => x.amount)
                ))
                .OrderByDescending(x => x.Qty)
                .ThenByDescending(x => x.Amount)
                .Take(take)
                .ToList();
        }

        _logger.LogDebug("[reports.top-products] from={From} to={To} take={Take} rows={Rows}",
            fromUtc, toUtc, take, rows.Count);

        return new ReportTopProductsResult(fromUtc, toUtc, rows);
    }

    public async Task<Report2SummaryResult> GetReports2SummaryAsync(CashlessContext db, int tenantId, DateTimeOffset fromDt, DateTimeOffset toDt)
    {
        var from = fromDt.UtcDateTime;
        var to = toDt.UtcDateTime;

        var chargesQ = db.Transactions
            .Where(x => x.TenantId == tenantId && x.Type == TransactionType.Charge && x.CreatedAt >= from && x.CreatedAt < to);

        var totalVendido = ToDecimal(await chargesQ.SumAsync(x => (double?)x.Amount));
        var txCount = await chargesQ.CountAsync();
        var userCount = await db.Users.Where(u => u.TenantId == tenantId).CountAsync();

        // OJO: propina/donación hoy NO se guardan en DB (tu /charge no las maneja),
        // así que por ahora regresan 0 hasta que implementemos ChargeRequestV2 y persistencia.
        var totalPropina = 0m;
        var totalDonacion = 0m;

        _logger.LogDebug("[reports2.summary] from={From} to={To} txCount={TxCount} totalVendido={TotalVendido}",
            from, to, txCount, totalVendido);

        return new Report2SummaryResult(
            from.ToString("yyyy-MM-dd"),
            to.AddDays(-1).ToString("yyyy-MM-dd"),
            totalVendido,
            totalPropina,
            totalDonacion,
            txCount,
            userCount,
            txCount > 0 ? totalVendido / txCount : 0m
        );
    }

    public async Task<List<SalesByAreaRow>> GetSalesByAreaAsync(CashlessContext db, int tenantId, DateTimeOffset from, DateTimeOffset to)
    {
        var fromUtc = from.UtcDateTime;
        var toUtc = to.UtcDateTime;
        var rows = await db.Transactions
            .Where(t => t.TenantId == tenantId && t.Type == TransactionType.Charge && t.CreatedAt >= fromUtc && t.CreatedAt <= toUtc)
            .GroupBy(t => t.AreaId)
            .Select(g => new
            {
                areaId = g.Key,
                txCount = g.Count(),
                totalSold = g.Sum(x => (double?)x.Amount) ?? 0d,
                totalTips = g.Sum(x => (double?)x.TipAmount) ?? 0d
            })
            .OrderByDescending(x => x.totalSold)
            .ToListAsync();

        var areaIds = rows.Where(r => r.areaId.HasValue).Select(r => r.areaId!.Value).ToList();
        var areaNames = await db.Areas
            .Where(a => a.TenantId == tenantId && areaIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id, a => a.Name);

        var result = rows
            .Select(r => new SalesByAreaRow(
                r.areaId,
                r.areaId.HasValue && areaNames.TryGetValue(r.areaId.Value, out var name) ? name : null,
                r.txCount,
                ToDecimal(r.totalSold),
                ToDecimal(r.totalTips),
                r.txCount > 0 ? ToDecimal(r.totalSold) / r.txCount : 0m
            ))
            .ToList();


        _logger.LogDebug("[reports.sales-by-area] from={From} to={To} rows={Rows}", fromUtc, toUtc, result.Count);

        return result;
    }

    private static decimal ToDecimal(double? value)
        => value.HasValue ? (decimal)value.Value : 0m;
}








