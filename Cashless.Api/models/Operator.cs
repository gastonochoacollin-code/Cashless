namespace Cashless.Api.Models;

public class Operator
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public OperatorRole Role { get; set; }

    public int? AreaId { get; set; }
    public Area? Area { get; set; }

    public string PinHash { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
