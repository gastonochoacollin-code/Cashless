namespace Cashless.Api.Dtos.Admin;

public record CreateUserRequest(string Name, string? Email, string? Phone);
