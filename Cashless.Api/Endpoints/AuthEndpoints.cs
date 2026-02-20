namespace Cashless.Api.Endpoints;

using Cashless.Api.Data;
using Cashless.Api.Dtos.Auth;
using Cashless.Api.Models;
using Cashless.Api.Services.Auth;
using Microsoft.EntityFrameworkCore;

public static class AuthEndpoints
{
    public static WebApplication MapAuthEndpoints(this WebApplication app)
    {
        app.MapGet("/ops", async (CashlessContext db) =>
        {
            return await db.Operators
                .Include(o => o.Area)
                .Where(o => o.IsActive)
                .OrderBy(o => o.Name)
                .Select(o => new
                {
                    o.Id,
                    o.Name,
                    role = o.Role.ToString(),
                    o.AreaId,
                    area = o.Area != null ? o.Area.Name : null,
                    o.IsActive
                })
                .ToListAsync();
        });

        app.MapGet("/areas", async (CashlessContext db) =>
        {
            return await db.Areas
                .Where(a => a.IsActive)
                .OrderBy(a => a.Name)
                .Select(a => new { a.Id, a.Name, type = a.Type.ToString() })
                .ToListAsync();
        });

        app.MapPost("/auth/login", async (CashlessContext db, LoginRequest req, IAuthService auth) =>
        {
            var op = await db.Operators
                .Include(o => o.Area)
                .FirstOrDefaultAsync(o => o.Id == req.OperatorId && o.IsActive);

            if (op is null)
                return Results.NotFound(new { message = "Operador no existe o inactivo" });

            if (!auth.ValidatePin(req.Pin.Trim(), op.PinHash))
                return Results.BadRequest(new { message = "PIN incorrecto" });

            return Results.Ok(new
            {
                operatorId = op.Id,
                name = op.Name,
                role = op.Role.ToString(),
                areaId = op.AreaId,
                area = op.Area != null ? op.Area.Name : null,
                token = auth.MakeToken(op.Id, op.PinHash)
            });
        });

        return app;
    }
}
