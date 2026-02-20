namespace Cashless.Api.Models;

public class Sale
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User User { get; set; } = null!;

    public string? CardUid { get; set; }

    public decimal Total { get; set; }

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<SaleItem> Items { get; set; } = new List<SaleItem>();

    public decimal Subtotal { get; set; }
public decimal TipAmount { get; set; }
public decimal DonationAmount { get; set; }
public int? DonationProjectId { get; set; } // opcional
public int? AreaId { get; set; }            // para reportes por barra/área
public int? OperatorId { get; set; }        // quién cobró

}
