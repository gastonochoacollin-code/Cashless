namespace Cashless.Api.Endpoints;

using Cashless.Api.Data;
using Cashless.Api.Services.Auth;
using Cashless.Api.Services.Reportes;

public static class ReportsEndpoints
{
    public static WebApplication MapReportsEndpoints(this WebApplication app)
    {
        // =======================
        // PROTEGIDO: REPORTES (server-side)
        // - summary: total vendido, propina, donación, usuarios, transacciones
        // - top-products: agrega por items guardados en Transaction.Note (SALE_SUBTOTAL)
        // =======================

        app.MapGet("/api/reports/summary", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, IReportService reports, string? from, string? to, int? areaId) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();

            var range = GetUtcRange(from, to);
            var result = await reports.GetReportsSummaryAsync(db, op.TenantId, range.From, range.To);
            return Results.Ok(result);
        });

        app.MapGet("/api/reports/top-products", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, IReportService reports, string? from, string? to, int? areaId, int take = 10) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();

            var range = GetUtcRange(from, to);
            var limit = Math.Clamp(take, 1, 50);

            var result = await reports.GetReportsTopProductsAsync(db, op.TenantId, range.From, range.To, limit);
            return Results.Ok(result);
        });

        app.MapGet("/api/reports/sales-by-area", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, IReportService reports, string? from, string? to) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();

            var range = GetUtcRange(from, to);
            var rows = await reports.GetSalesByAreaAsync(db, op.TenantId, range.From, range.To);
            return Results.Ok(rows);
        });

        return app;
    }

    private static (DateTimeOffset From, DateTimeOffset To) GetUtcRange(string? from, string? to)
    {
        var now = DateTimeOffset.UtcNow;
        var defaultFrom = now.Date.AddDays(-6);
        var defaultTo = now.Date.AddDays(1);

        var fromDt = TryParseIsoUtc(from) ?? defaultFrom;
        var toDt = TryParseIsoUtc(to) ?? defaultTo;

        return (fromDt, toDt);
    }

    private static DateTimeOffset? TryParseIsoUtc(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        if (!DateTimeOffset.TryParse(s, out var dt)) return null;
        return dt.ToUniversalTime().Date;
    }
}
