namespace Cashless.Api.Models;

public class Card
{
    public int Id { get; set; }

    // UID NFC (único)
    public string Uid { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public DateTime LinkedAt { get; set; } = DateTime.UtcNow;

    // FK
    public int UserId { get; set; }
    public User User { get; set; } = null!;
}
