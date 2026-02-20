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

        app.MapGet("/api/reports/summary", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, IReportService reports, string? from, string? to) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();

            var f = ParseDate(from) ?? DateTime.MinValue;
            var t = ParseDate(to, endOfDay: true) ?? DateTime.MaxValue;

            var result = await reports.GetReportsSummaryAsync(db, f, t);
            return Results.Ok(result);
        });

        app.MapGet("/api/reports/top-products", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, IReportService reports, string? from, string? to, int take = 10) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();

            var f = ParseDate(from) ?? DateTime.MinValue;
            var t = ParseDate(to, endOfDay: true) ?? DateTime.MaxValue;
            var limit = Math.Clamp(take, 1, 50);

            var result = await reports.GetReportsTopProductsAsync(db, f, t, limit);
            return Results.Ok(result);
        });

        // =======================
        // REPORTES (v2) - basado en Transactions (porque /charge guarda Transaction)
        // =======================
        app.MapGet("/api/reports2/summary", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, IReportService reports, string? from, string? to) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();

            var fromDt = ParseRangeDate(from, DateTime.Today.AddDays(-6), endExclusive: false);
            var toDt = ParseRangeDate(to, DateTime.Today.AddDays(1), endExclusive: true); // exclusivo

            var result = await reports.GetReports2SummaryAsync(db, fromDt, toDt);
            return Results.Ok(result);
        });

        app.MapGet("/api/reports2/top-products", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, IReportService reports, string? from, string? to, int take = 10) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();

            var f = ParseDate(from) ?? DateTime.MinValue;
            var t = ParseDate(to, endOfDay: true) ?? DateTime.MaxValue;
            var limit = Math.Clamp(take, 1, 50);

            var result = await reports.GetReportsTopProductsAsync(db, f, t, limit);
            return Results.Ok(result.Items);
        });

        return app;
    }

    private static DateTime? ParseDate(string? s, bool endOfDay = false)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        if (!DateTime.TryParse(s, out var d)) return null;
        return endOfDay ? d.Date.AddDays(1).AddTicks(-1) : d.Date;
    }

    private static DateTime ParseRangeDate(string? s, DateTime defaultValue, bool endExclusive)
    {
        if (!DateTime.TryParse(s, out var d)) return defaultValue;
        return endExclusive ? d.Date.AddDays(1) : d.Date;
    }
}
