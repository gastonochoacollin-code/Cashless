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
        app.MapGet("/ops", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var tenantId = await ResolveTenantId(db, auth, http.Request);
            if (!tenantId.HasValue)
                return Results.BadRequest(new { message = "TenantId requerido" });

            var list = await db.Operators
                .Include(o => o.Area)
                .Where(o => o.IsActive && o.TenantId == tenantId.Value)
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

            return Results.Ok(list);
        });

        app.MapGet("/areas", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var tenantId = await ResolveTenantId(db, auth, http.Request);
            if (!tenantId.HasValue)
                return Results.BadRequest(new { message = "TenantId requerido" });

            var list = await db.Areas
                .Where(a => a.IsActive && a.TenantId == tenantId.Value)
                .OrderBy(a => a.Name)
                .Select(a => new { a.Id, a.Name, type = a.Type.ToString() })
                .ToListAsync();

            return Results.Ok(list);
        });

        app.MapPost("/auth/login", async (CashlessContext db, HttpContext http, LoginRequest req, IAuthService auth) =>
        {
            var tenantId = await ResolveTenantId(db, auth, http.Request);
            if (!tenantId.HasValue)
                return Results.BadRequest(new { message = "TenantId requerido" });

            var op = await db.Operators
                .Include(o => o.Area)
                .FirstOrDefaultAsync(o => o.Id == req.OperatorId && o.IsActive && o.TenantId == tenantId.Value);

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
                tenantId = op.TenantId,
                token = auth.MakeToken(op.Id, op.PinHash)
            });
        });

        return app;
    }

    private static async Task<int?> ResolveTenantId(CashlessContext db, IAuthService auth, HttpRequest req)
    {
        var tenantId = auth.ReadTenantId(req);
        if (tenantId.HasValue) return tenantId;

        var ids = await db.Tenants.Select(t => t.Id).Take(2).ToListAsync();
        if (ids.Count == 1) return ids[0];

        return null;
    }
}
