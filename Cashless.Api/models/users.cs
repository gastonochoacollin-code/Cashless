namespace Cashless.Api.Models;

public class User
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Email { get; set; }      // 👈 nuevo
    public string? Phone { get; set; }      // 👈 nuevo
    public decimal TotalSpent { get; set; } = 0m; // 👈 nuevo

    public decimal Balance { get; set; } = 0m;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Card> Cards { get; set; } = new List<Card>();

    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
}