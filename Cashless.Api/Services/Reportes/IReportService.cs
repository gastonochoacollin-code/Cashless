namespace Cashless.Api.Services.Reportes;

using Cashless.Api.Data;

public interface IReportService
{
    Task<Report1SummaryResult> GetReports1SummaryAsync(CashlessContext db, DateTime fromDt, DateTime toDt, int? areaId);
    Task<List<Report1TopProductRow>> GetReports1TopProductsAsync(CashlessContext db, DateTime fromDt, DateTime toDt, int? areaId, int limit);
    Task<ReportSummaryResult> GetReportsSummaryAsync(CashlessContext db, DateTime from, DateTime to);
    Task<ReportTopProductsResult> GetReportsTopProductsAsync(CashlessContext db, DateTime from, DateTime to, int take);
    Task<Report2SummaryResult> GetReports2SummaryAsync(CashlessContext db, DateTime fromDt, DateTime toDt);
}

public sealed record Report1SummaryResult(
    string From,
    string To,
    decimal TotalVendido,
    decimal TotalPropina,
    decimal TotalDonacion,
    int Transacciones,
    int Usuarios,
    decimal TicketPromedio
);

public sealed record Report1TopProductRow(
    int ProductId,
    string? Name,
    int Qty,
    decimal Amount
);

public sealed record ReportSummaryResult(
    DateTime From,
    DateTime To,
    int UserCount,
    int TxCount,
    decimal TotalSold,
    decimal TotalTips,
    decimal TotalDonations,
    decimal TotalCharged
);

public sealed record ReportTopProductRow(
    int ProductId,
    string Name,
    int Qty,
    decimal Amount
);

public sealed record ReportTopProductsResult(
    DateTime From,
    DateTime To,
    List<ReportTopProductRow> Items
);

public sealed record Report2SummaryResult(
    string From,
    string To,
    decimal TotalVendido,
    decimal TotalPropina,
    decimal TotalDonacion,
    int Transacciones,
    int Usuarios,
    decimal TicketPromedio
);
