namespace Cashless.Api.Endpoints;

using Cashless.Api.Data;
using Cashless.Api.Dtos.Admin;
using Cashless.Api.Models;
using Cashless.Api.Services.Auth;
using Microsoft.EntityFrameworkCore;

public static class AdminEndpoints
{
    private static readonly string[] PERM_CATALOG = new[]
    {
        "dashboard.view",
        "pos.charge",
        "pos.topup",
        "users.view",
        "users.create",
        "users.edit",
        "cards.assign",
        "areas.view",
        "areas.manage",
        "products.view",
        "products.manage",
        "menus.manage",
        "operators.view",
        "operators.manage",
        "permissions.view",
        "permissions.manage"
    };

    private static readonly Dictionary<OperatorRole, HashSet<string>> ROLE_PERMS = new()
    {
        [OperatorRole.SuperAdmin] = new HashSet<string>(PERM_CATALOG, StringComparer.OrdinalIgnoreCase),

        [OperatorRole.Admin] = new HashSet<string>(new[]
        {
            "dashboard.view",
            "pos.charge","pos.topup",
            "users.view","users.create","users.edit","cards.assign",
            "areas.view","areas.manage",
            "products.view","products.manage",
            "menus.manage",
            "operators.view","operators.manage",
            "permissions.view"
        }, StringComparer.OrdinalIgnoreCase),

        [OperatorRole.JefeOperativo] = new HashSet<string>(new[]
        {
            "dashboard.view",
            "pos.charge","pos.topup",
            "users.view","users.create","users.edit","cards.assign",
            "areas.view",
            "products.view",
            "permissions.view"
        }, StringComparer.OrdinalIgnoreCase),

        [OperatorRole.JefeDeBarra] = new HashSet<string>(new[]
        {
            "dashboard.view",
            "pos.charge",
            "users.view",
            "areas.view",
            "products.view"
        }, StringComparer.OrdinalIgnoreCase),

        [OperatorRole.JefeDeStand] = new HashSet<string>(new[]
        {
            "dashboard.view",
            "pos.charge",
            "users.view",
            "areas.view",
            "products.view"
        }, StringComparer.OrdinalIgnoreCase),
    };

    public static WebApplication MapAdminEndpoints(this WebApplication app)
    {
        app.MapGet("/api/operators/{id:int}/areas", async Task<IResult> (int id, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var list = await db.OperatorAreas
                .Include(x => x.Area)
                .Where(x => x.OperatorId == id && x.IsActive && x.TenantId == tenantId)
                .Select(x => new
                {
                    x.Id,
                    x.OperatorId,
                    x.AreaId,
                    areaName = x.Area != null ? x.Area.Name : null,
                    x.IsActive
                })
                .ToListAsync();

            return Results.Ok(list);
        });

        app.MapPost("/api/operators/{id:int}/areas", async Task<IResult> (int id, OperatorArea dto, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var operatorExists = await db.Operators.AnyAsync(o => o.Id == id && o.TenantId == tenantId);
            if (!operatorExists) return Results.NotFound(new { message = "Operador no existe" });

            var areaExists = await db.Areas.AnyAsync(a => a.Id == dto.AreaId && a.TenantId == tenantId);
            if (!areaExists) return Results.BadRequest(new { message = "AreaId inválido" });

            dto.OperatorId = id;
            dto.TenantId = tenantId;
            db.OperatorAreas.Add(dto);
            await db.SaveChangesAsync();
            return Results.Ok(dto);
        });

        // ===================== FESTIVALS - PROTEGIDO =====================
        app.MapGet("/api/festivals", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var list = await db.Festivals
                .Where(f => f.TenantId == tenantId)
                .OrderByDescending(f => f.Id)
                .Select(f => new
                {
                    f.Id,
                    f.Name,
                    f.StartDate,
                    f.EndDate,
                    f.IsActive
                })
                .ToListAsync();

            return Results.Ok(list);
        });

        app.MapPost("/api/festivals", async Task<IResult> (FestivalCreateRequest dto, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.BadRequest(new { message = "Nombre requerido" });

            if (dto.EndDate < dto.StartDate)
                return Results.BadRequest(new { message = "Rango de fechas inválido" });

            if (dto.IsActive)
            {
                var actives = await db.Festivals.Where(f => f.TenantId == tenantId && f.IsActive).ToListAsync();
                foreach (var f in actives) f.IsActive = false;
            }

            var festival = new Festival
            {
                Name = dto.Name.Trim(),
                StartDate = dto.StartDate,
                EndDate = dto.EndDate,
                IsActive = dto.IsActive,
                TenantId = tenantId
            };

            db.Festivals.Add(festival);
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                festival.Id,
                festival.Name,
                festival.StartDate,
                festival.EndDate,
                festival.IsActive
            });
        });

        app.MapPost("/api/festivals/{id:int}/activate", async Task<IResult> (int id, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var target = await db.Festivals.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == tenantId);
            if (target is null) return Results.NotFound(new { message = "Festival no existe" });

            var actives = await db.Festivals.Where(f => f.TenantId == tenantId && f.IsActive && f.Id != id).ToListAsync();
            foreach (var f in actives) f.IsActive = false;

            target.IsActive = true;
            await db.SaveChangesAsync();

            return Results.Ok(new { ok = true });
        });

        // ===================== AREAS (BARRAS) - PROTEGIDO (Type string + CustomType) =====================
        app.MapGet("/api/areas", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var areas = await db.Areas
                .Where(a => a.TenantId == tenantId)
                .OrderBy(a => a.Name)
                .Select(a => new
                {
                    a.Id,
                    a.Name,
                    Type = a.Type.ToString(),
                    a.IsActive,
                    a.CustomType
                })
                .ToListAsync();

            return Results.Ok(areas);
        });

        app.MapPost("/api/areas", async Task<IResult> (AreaUpsertDto dto, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.BadRequest(new { message = "Name is required." });

            if (!Enum.TryParse<AreaType>(dto.Type ?? "Barra", true, out var parsedType))
                parsedType = AreaType.Barra;

            var area = new Area
            {
                Name = dto.Name.Trim(),
                Type = parsedType,
                IsActive = dto.IsActive,
                CustomType = string.IsNullOrWhiteSpace(dto.CustomType) ? null : dto.CustomType.Trim(),
                TenantId = tenantId
            };

            db.Areas.Add(area);
            await db.SaveChangesAsync();

            return Results.Created($"/api/areas/{area.Id}", new
            {
                area.Id,
                area.Name,
                Type = area.Type.ToString(),
                area.IsActive,
                area.CustomType
            });
        });

        app.MapPut("/api/areas/{id:int}", async Task<IResult> (int id, AreaUpsertDto dto, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var area = await db.Areas.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId);
            if (area is null) return Results.NotFound(new { message = "Area no existe" });

            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.BadRequest(new { message = "Name is required." });

            if (!Enum.TryParse<AreaType>(dto.Type ?? "Barra", true, out var parsedType))
                parsedType = AreaType.Barra;

            area.Name = dto.Name.Trim();
            area.Type = parsedType;
            area.IsActive = dto.IsActive;
            area.CustomType = string.IsNullOrWhiteSpace(dto.CustomType) ? null : dto.CustomType.Trim();

            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                area.Id,
                area.Name,
                Type = area.Type.ToString(),
                area.IsActive,
                area.CustomType
            });
        });

        app.MapDelete("/api/areas/{id:int}", async Task<IResult> (int id, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var area = await db.Areas.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId);
            if (area is null) return Results.NotFound(new { message = "Area no existe" });

            area.IsActive = false;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ===================== PRODUCTS - PROTEGIDO =====================
        app.MapGet("/api/products", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var list = await db.Products
                .Where(p => p.TenantId == tenantId)
                .OrderByDescending(p => p.Id)
                .Select(p => new
                {
                    p.Id,
                    p.Name,
                    p.Price,
                    p.Category,
                    p.IsActive,
                    p.CreatedAt
                })
                .ToListAsync();

            return Results.Ok(list);
        });
        app.MapPost("/api/products", async Task<IResult> (ProductUpsertDto dto, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.BadRequest(new { message = "Nombre requerido" });

            if (dto.Price < 0)
                return Results.BadRequest(new { message = "Precio inválido" });

            var p = new Product
            {
                Name = dto.Name.Trim(),
                Price = dto.Price,
                Category = string.IsNullOrWhiteSpace(dto.Category) ? null : dto.Category.Trim(),
                IsActive = dto.IsActive,
                TenantId = tenantId
            };

            db.Products.Add(p);
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                p.Id,
                p.Name,
                p.Price,
                p.Category,
                p.IsActive,
                p.CreatedAt
            });
        });

        app.MapPut("/api/products/{id:int}", async Task<IResult> (int id, ProductUpsertDto dto, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var p = await db.Products.FirstOrDefaultAsync(p => p.Id == id && p.TenantId == tenantId);
            if (p is null) return Results.NotFound(new { message = "Producto no existe" });

            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.BadRequest(new { message = "Nombre requerido" });

            if (dto.Price < 0)
                return Results.BadRequest(new { message = "Precio inválido" });

            p.Name = dto.Name.Trim();
            p.Price = dto.Price;
            p.Category = string.IsNullOrWhiteSpace(dto.Category) ? null : dto.Category.Trim();
            p.IsActive = dto.IsActive;

            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                p.Id,
                p.Name,
                p.Price,
                p.Category,
                p.IsActive,
                p.CreatedAt
            });
        });

        app.MapDelete("/api/products/{id:int}", async Task<IResult> (int id, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var p = await db.Products.FirstOrDefaultAsync(p => p.Id == id && p.TenantId == tenantId);
            if (p is null) return Results.NotFound(new { message = "Producto no existe" });

            p.IsActive = false;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ===================== MENU POR AREA (AreaProduct) - PROTEGIDO =====================
        app.MapGet("/api/areas/{areaId:int}/products", async Task<IResult> (int areaId, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var area = await db.Areas.FirstOrDefaultAsync(a => a.Id == areaId && a.TenantId == tenantId);
            if (area is null) return Results.NotFound(new { message = "Area no existe" });

            var list = await db.AreaProducts
                .Include(ap => ap.Product)
                .Where(ap => ap.AreaId == areaId && ap.TenantId == tenantId)
                .OrderBy(ap => ap.Product.Name)
                .Select(ap => new
                {
                    ap.Id,
                    ap.AreaId,
                    ap.ProductId,
                    productName = ap.Product.Name,
                    basePrice = ap.Product.Price,
                    category = ap.Product.Category,
                    productIsActive = ap.Product.IsActive,
                    ap.PriceOverride,
                    effectivePrice = (ap.PriceOverride ?? ap.Product.Price),
                    ap.IsActive
                })
                .ToListAsync();

            return Results.Ok(list);
        });

        app.MapPost("/api/areas/{areaId:int}/products", async Task<IResult> (int areaId, AreaProductCreateDto dto, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var area = await db.Areas.FirstOrDefaultAsync(a => a.Id == areaId && a.TenantId == tenantId);
            if (area is null) return Results.NotFound(new { message = "Area no existe" });

            var product = await db.Products.FirstOrDefaultAsync(p => p.Id == dto.ProductId && p.TenantId == tenantId);
            if (product is null) return Results.NotFound(new { message = "Producto no existe" });

            var exists = await db.AreaProducts.AnyAsync(x => x.AreaId == areaId && x.ProductId == dto.ProductId && x.TenantId == tenantId);
            if (exists) return Results.BadRequest(new { message = "Ese producto ya está en el menú de esta barra." });

            if (dto.PriceOverride is not null && dto.PriceOverride < 0)
                return Results.BadRequest(new { message = "PriceOverride inválido" });

            var link = new AreaProduct
            {
                AreaId = areaId,
                ProductId = dto.ProductId,
                PriceOverride = dto.PriceOverride,
                IsActive = dto.IsActive,
                TenantId = tenantId
            };

            db.AreaProducts.Add(link);
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                link.Id,
                link.AreaId,
                link.ProductId,
                productName = product.Name,
                basePrice = product.Price,
                category = product.Category,
                productIsActive = product.IsActive,
                link.PriceOverride,
                effectivePrice = (link.PriceOverride ?? product.Price),
                link.IsActive
            });
        });
        app.MapPut("/api/areas/{areaId:int}/products/{areaProductId:int}", async Task<IResult> (int areaId, int areaProductId, AreaProductUpdateDto dto, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var link = await db.AreaProducts
                .Include(x => x.Product)
                .FirstOrDefaultAsync(x => x.Id == areaProductId && x.AreaId == areaId && x.TenantId == tenantId);

            if (link is null) return Results.NotFound(new { message = "No existe ese producto en el menú de esta barra." });

            if (dto.PriceOverride is not null && dto.PriceOverride < 0)
                return Results.BadRequest(new { message = "PriceOverride inválido" });

            link.PriceOverride = dto.PriceOverride;
            link.IsActive = dto.IsActive;

            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                link.Id,
                link.AreaId,
                link.ProductId,
                productName = link.Product.Name,
                basePrice = link.Product.Price,
                category = link.Product.Category,
                productIsActive = link.Product.IsActive,
                link.PriceOverride,
                effectivePrice = (link.PriceOverride ?? link.Product.Price),
                link.IsActive
            });
        });

        app.MapDelete("/api/areas/{areaId:int}/products/{areaProductId:int}", async Task<IResult> (int areaId, int areaProductId, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var link = await db.AreaProducts.FirstOrDefaultAsync(x => x.Id == areaProductId && x.AreaId == areaId && x.TenantId == tenantId);
            if (link is null) return Results.NotFound(new { message = "No existe ese vínculo." });

            db.AreaProducts.Remove(link);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ===================== OPERATORS (COLABORADORES) - PROTEGIDO =====================
        app.MapGet("/api/operators", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var list = await db.Operators
                .Include(o => o.Area)
                .Where(o => o.TenantId == tenantId)
                .OrderBy(o => o.Id)
                .Select(o => new
                {
                    o.Id,
                    o.Name,
                    Role = o.Role.ToString(),
                    o.AreaId,
                    Area = o.Area != null ? o.Area.Name : null,
                    o.IsActive
                })
                .ToListAsync();

            return Results.Ok(list);
        });

        app.MapPost("/api/operators", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, OperatorUpsertDto dto) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            if (!CanManageOperators(op)) return Forbidden("No tienes permisos para crear colaboradores.");
            var tenantId = op.TenantId;

            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.BadRequest(new { message = "Nombre requerido" });

            if (string.IsNullOrWhiteSpace(dto.Pin) || dto.Pin.Trim().Length < 4)
                return Results.BadRequest(new { message = "PIN requerido (mínimo 4 dígitos)" });

            if (!Enum.TryParse<OperatorRole>(dto.Role ?? "JefeDeBarra", true, out var parsedRole))
                parsedRole = OperatorRole.JefeDeBarra;

            if (parsedRole == OperatorRole.SuperAdmin && op.Role != OperatorRole.SuperAdmin)
                return Forbidden("Solo SuperAdmin puede crear otro SuperAdmin.");

            int areaId = dto.AreaId ?? 0;
            if (areaId <= 0)
                areaId = await db.Areas.Where(a => a.TenantId == tenantId).OrderBy(a => a.Id).Select(a => a.Id).FirstOrDefaultAsync();

            if (areaId <= 0) return Results.BadRequest(new { message = "No hay Areas creadas para asignar." });

            var areaExists = await db.Areas.AnyAsync(a => a.Id == areaId && a.TenantId == tenantId);
            if (!areaExists) return Results.BadRequest(new { message = "AreaId inválido" });

            var entity = new Operator
            {
                Name = dto.Name.Trim(),
                Role = parsedRole,
                AreaId = areaId,
                PinHash = auth.HashPin(dto.Pin.Trim()),
                IsActive = dto.IsActive,
                TenantId = tenantId
            };

            db.Operators.Add(entity);
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                entity.Id,
                entity.Name,
                Role = entity.Role.ToString(),
                entity.AreaId,
                entity.IsActive
            });
        });

        app.MapPut("/api/operators/{id:int}", async Task<IResult> (int id, CashlessContext db, HttpContext http, IAuthService auth, OperatorUpsertDto dto) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            if (!CanManageOperators(op)) return Forbidden("No tienes permisos para editar colaboradores.");
            var tenantId = op.TenantId;

            var target = await db.Operators.FirstOrDefaultAsync(o => o.Id == id && o.TenantId == tenantId);
            if (target is null) return Results.NotFound(new { message = "Operador no existe" });

            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.BadRequest(new { message = "Nombre requerido" });

            if (!Enum.TryParse<OperatorRole>(dto.Role ?? target.Role.ToString(), true, out var parsedRole))
                parsedRole = target.Role;

            if (parsedRole == OperatorRole.SuperAdmin && op.Role != OperatorRole.SuperAdmin)
                return Forbidden("Solo SuperAdmin puede asignar rol SuperAdmin.");

            if ((target.Role == OperatorRole.SuperAdmin || target.Role == OperatorRole.Admin) && op.Role != OperatorRole.SuperAdmin)
                return Forbidden("Solo SuperAdmin puede editar Admin/SuperAdmin.");

            target.Name = dto.Name.Trim();
            target.Role = parsedRole;
            target.IsActive = dto.IsActive;

            if (dto.AreaId.HasValue && dto.AreaId.Value > 0)
            {
                var areaExists = await db.Areas.AnyAsync(a => a.Id == dto.AreaId.Value && a.TenantId == tenantId);
                if (!areaExists) return Results.BadRequest(new { message = "AreaId inválido" });
                target.AreaId = dto.AreaId.Value;
            }

            if (!string.IsNullOrWhiteSpace(dto.Pin))
                target.PinHash = auth.HashPin(dto.Pin.Trim());

            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                target.Id,
                target.Name,
                Role = target.Role.ToString(),
                target.AreaId,
                target.IsActive
            });
        });

        app.MapDelete("/api/operators/{id:int}", async Task<IResult> (int id, CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            if (!CanManageOperators(op)) return Forbidden("No tienes permisos para desactivar colaboradores.");
            var tenantId = op.TenantId;

            var target = await db.Operators.FirstOrDefaultAsync(o => o.Id == id && o.TenantId == tenantId);
            if (target is null) return Results.NotFound(new { message = "Operador no existe" });

            if (target.Id == op.Id)
                return Results.BadRequest(new { message = "No puedes desactivarte a ti mismo." });

            if (!CanDeleteOperator(op, target))
                return Forbidden("No tienes permisos para desactivar ese rol.");

            target.IsActive = false;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
        // ===================== PROTEGIDO: Cards lookup =====================
        app.MapGet("/cards/{uid}", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, string uid) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var clean = (uid ?? "").Trim().ToUpperInvariant();

            var card = await db.Cards
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.Uid == clean && c.TenantId == tenantId && c.User.TenantId == tenantId);

            if (card is null) return Results.NotFound(new { message = "Card no existe (no asignada)" });

            return Results.Ok(new
            {
                card.Id,
                card.Uid,
                userId = card.UserId,
                userName = card.User.Name,
                balance = card.User.Balance
            });
        });

        // ===================== PROTEGIDO: Users + assign card =====================
        app.MapGet("/users", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var users = await db.Users
                .Where(u => u.TenantId == tenantId)
                .OrderByDescending(u => u.Id)
                .Select(u => new
                {
                    u.Id,
                    u.Name,
                    u.Email,
                    u.Phone,
                    u.Balance,
                    u.TotalSpent,
                    u.CreatedAt
                })
                .ToListAsync();

            return Results.Ok(users);
        });

        app.MapPost("/users", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, CreateUserRequest req) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            if (string.IsNullOrWhiteSpace(req.Name))
                return Results.BadRequest(new { message = "Nombre requerido" });

            var user = new User
            {
                Name = req.Name.Trim(),
                Email = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim(),
                Phone = string.IsNullOrWhiteSpace(req.Phone) ? null : req.Phone.Trim(),
                Balance = 0,
                TotalSpent = 0,
                TenantId = tenantId
            };

            db.Users.Add(user);
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                user.Id,
                user.Name,
                user.Email,
                user.Phone,
                user.Balance,
                user.TotalSpent,
                user.CreatedAt
            });
        });

        app.MapPost("/assign-card", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, AssignCardRequest req) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            if (req.UserId <= 0) return Results.BadRequest(new { message = "UserId inválido" });
            if (string.IsNullOrWhiteSpace(req.Uid)) return Results.BadRequest(new { message = "UID requerido" });

            var uid = req.Uid.Trim().ToUpperInvariant();

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == req.UserId && u.TenantId == tenantId);
            if (user is null) return Results.NotFound(new { message = "Usuario no existe" });

            var cardExists = await db.Cards.AnyAsync(c => c.Uid == uid);
            if (cardExists) return Results.BadRequest(new { message = "Pulsera ya asignada" });

            db.Cards.Add(new Card { Uid = uid, UserId = user.Id, TenantId = tenantId });
            await db.SaveChangesAsync();

            return Results.Ok(new { ok = true });
        });

        app.MapGet("/transactions/{uid}", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, string uid) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var clean = (uid ?? "").Trim().ToUpperInvariant();

            var card = await db.Cards.Include(c => c.User).FirstOrDefaultAsync(c => c.Uid == clean && c.TenantId == tenantId && c.User.TenantId == tenantId);
            if (card is null) return Results.NotFound(new { message = "Pulsera no asignada" });

            var tx = await db.Transactions
                .Where(t => t.UserId == card.User.Id && t.TenantId == tenantId)
                .OrderByDescending(t => t.Id)
                .Take(50)
                .Select(t => new
                {
                    t.Id,
                    type = t.Type.ToString(),
                    t.Amount,
                    t.CardUid,
                    t.CreatedAt
                })
                .ToListAsync();

            return Results.Ok(new
            {
                userName = card.User.Name,
                balance = card.User.Balance,
                transactions = tx
            });
        });

        app.MapPut("/users/{id}/contact", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, int id, UpdateUserContactRequest req) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id && u.TenantId == tenantId);
            if (user is null) return Results.NotFound(new { message = "Usuario no existe" });

            user.Email = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim();
            user.Phone = string.IsNullOrWhiteSpace(req.Phone) ? null : req.Phone.Trim();

            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                user.Id,
                user.Name,
                user.Email,
                user.Phone,
                user.Balance,
                user.TotalSpent,
                user.CreatedAt
            });
        });

        app.MapPost("/reassign-card", async Task<IResult> (CashlessContext db, HttpContext http, IAuthService auth, ReassignCardRequest req) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();
            var tenantId = op.TenantId;

            if (req.UserId <= 0) return Results.BadRequest(new { message = "UserId inválido" });
            if (string.IsNullOrWhiteSpace(req.Uid)) return Results.BadRequest(new { message = "UID requerido" });

            var uid = req.Uid.Trim().ToUpperInvariant();

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == req.UserId && u.TenantId == tenantId);
            if (user is null) return Results.NotFound(new { message = "Usuario no existe" });

            var uidExists = await db.Cards.AnyAsync(c => c.Uid == uid);
            if (uidExists) return Results.BadRequest(new { message = "Pulsera ya asignada" });

            var card = await db.Cards.FirstOrDefaultAsync(c => c.UserId == user.Id && c.TenantId == tenantId);
            string? oldUid = null;

            if (card is null)
                db.Cards.Add(new Card { Uid = uid, UserId = user.Id, TenantId = tenantId });
            else
            {
                oldUid = card.Uid;
                card.Uid = uid;
            }

            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, oldUid });
        });

        // ===================== PERMISSIONS (roles -> permisos) - PROTEGIDO =====================
        // Nota: por ahora es RBAC simple (por rol). Más adelante podemos meter overrides por operador en BD.
        app.MapGet("/api/permissions", async (CashlessContext db, HttpContext http, IAuthService auth) =>
        {
            var op = await auth.AuthenticateAsync(db, http.Request);
            if (op is null) return Results.Unauthorized();

            // Si quieres restringir: solo Admin/SuperAdmin
            if (op.Role != OperatorRole.SuperAdmin && op.Role != OperatorRole.Admin)
                return Results.Json(new { message = "Forbidden" }, statusCode: 403);

            // Respuesta en el formato que permisos.js espera:
            var roles = new[] { "SuperAdmin","Admin","JefeOperativo","JefeDeBarra","JefeDeStand" };

            var permissions = new[]
            {
                new { key="dashboard_view", title="Ver dashboard", desc="Acceso al panel principal." },
                new { key="pos_use", title="Usar POS", desc="Cobrar con pulsera en barra/stand." },
                new { key="topup", title="Recargar saldo", desc="Hacer recargas (top-up) a pulseras." },
                new { key="charge", title="Cobrar", desc="Aplicar cargos (charge) a pulseras." },
                new { key="users_manage", title="Usuarios", desc="Crear/editar usuarios y asignar pulseras." },
                new { key="areas_manage", title="Barras / Áreas", desc="Crear/editar barras, stands, tipos y customType." },
                new { key="products_manage", title="Productos", desc="Crear/editar catálogo de productos." },
                new { key="menus_manage", title="Menús por barra", desc="Asignar productos por barra (AreaProduct)." },
                new { key="operators_manage", title="Colaboradores", desc="Crear/editar/desactivar operadores." },
                new { key="reports_view", title="Reportes", desc="Ver estadísticas de ventas/consumo." },
                new { key="permissions_view", title="Ver permisos", desc="Ver matriz de permisos por rol." },
                new { key="permissions_manage", title="Administrar permisos", desc="Cambiar permisos (solo SuperAdmin)." },
            };

            var matrix = new Dictionary<string, Dictionary<string, bool>>
            {
                ["SuperAdmin"] = new() {
                    ["dashboard_view"]=true, ["pos_use"]=true, ["topup"]=true, ["charge"]=true,
                    ["users_manage"]=true, ["areas_manage"]=true, ["products_manage"]=true, ["menus_manage"]=true,
                    ["operators_manage"]=true, ["reports_view"]=true, ["permissions_view"]=true, ["permissions_manage"]=true
                },
                ["Admin"] = new() {
                    ["dashboard_view"]=true, ["pos_use"]=true, ["topup"]=true, ["charge"]=true,
                    ["users_manage"]=true, ["areas_manage"]=true, ["products_manage"]=true, ["menus_manage"]=true,
                    ["operators_manage"]=true, ["reports_view"]=true, ["permissions_view"]=true, ["permissions_manage"]=false
                },
                ["JefeOperativo"] = new() {
                    ["dashboard_view"]=true, ["pos_use"]=false, ["topup"]=true, ["charge"]=false,
                    ["users_manage"]=true, ["areas_manage"]=true, ["products_manage"]=true, ["menus_manage"]=true,
                    ["operators_manage"]=false, ["reports_view"]=true, ["permissions_view"]=true, ["permissions_manage"]=false
                },
                ["JefeDeBarra"] = new() {
                    ["dashboard_view"]=true, ["pos_use"]=true, ["topup"]=false, ["charge"]=true,
                    ["users_manage"]=false, ["areas_manage"]=false, ["products_manage"]=false, ["menus_manage"]=false,
                    ["operators_manage"]=false, ["reports_view"]=false, ["permissions_view"]=false, ["permissions_manage"]=false
                },
                ["JefeDeStand"] = new() {
                    ["dashboard_view"]=true, ["pos_use"]=true, ["topup"]=false, ["charge"]=true,
                    ["users_manage"]=false, ["areas_manage"]=false, ["products_manage"]=false, ["menus_manage"]=false,
                    ["operators_manage"]=false, ["reports_view"]=false, ["permissions_view"]=false, ["permissions_manage"]=false
                },
            };

            return Results.Ok(new { roles, permissions, matrix });
        });

        return app;
    }

    private static IResult Forbidden(string msg = "Forbidden")
        => Results.Json(new { message = msg }, statusCode: 403);

    private static bool CanManageOperators(Operator op)
        => op.Role == OperatorRole.SuperAdmin || op.Role == OperatorRole.Admin;

    private static bool CanDeleteOperator(Operator op, Operator target)
    {
        // Solo SuperAdmin puede desactivar Admin / SuperAdmin
        if (target.Role == OperatorRole.SuperAdmin) return op.Role == OperatorRole.SuperAdmin;
        if (target.Role == OperatorRole.Admin) return op.Role == OperatorRole.SuperAdmin;

        // Admin puede desactivar roles menores
        return op.Role == OperatorRole.SuperAdmin || op.Role == OperatorRole.Admin;
    }
}
