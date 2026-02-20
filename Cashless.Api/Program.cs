using Cashless.Api.Data;
using Cashless.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;

Console.WriteLine("🔥 PROGRAM.CS (Cashless.Api) 🔥");

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<CashlessContext>(opt =>
    opt.UseSqlite("Data Source=cashless.db"));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

app.UseDefaultFiles();
app.UseStaticFiles();



// =======================
// Helpers Auth
// =======================
string HashPin(string pin)
{
    using var sha = SHA256.Create();
    return Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(pin)));
}

string MakeToken(int operatorId, string pinHash)
{
    using var sha = SHA256.Create();
    return Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes($"{operatorId}:{pinHash}")));
}

async Task<Operator?> Authenticate(CashlessContext db, HttpRequest req)
{
    // 1) operatorId: acepta varias variantes
    string? opIdRaw =
        req.Headers["X-Operator-Id"].FirstOrDefault()
        ?? req.Headers["X-OperatorId"].FirstOrDefault()
        ?? req.Headers["operatorid"].FirstOrDefault()
        ?? req.Headers["OperatorId"].FirstOrDefault();

    if (!int.TryParse(opIdRaw, out var id)) return null;

    // 2) token: acepta Bearer y alternativos
    string? tokenRaw = req.Headers["X-Operator-Token"].FirstOrDefault()
        ?? req.Headers["x-operator-token"].FirstOrDefault()
        ?? req.Headers["token"].FirstOrDefault()
        ?? req.Headers["x-auth-token"].FirstOrDefault()
        ?? req.Headers["x-access-token"].FirstOrDefault()
        ?? req.Headers["x-token"].FirstOrDefault();

    // Authorization: Bearer xxx
    var auth = req.Headers["authorization"].FirstOrDefault();
    if (!string.IsNullOrWhiteSpace(auth) && auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        tokenRaw ??= auth.Substring("Bearer ".Length).Trim();

    if (string.IsNullOrWhiteSpace(tokenRaw)) return null;

    var op = await db.Operators
        .Include(o => o.Area)
        .FirstOrDefaultAsync(o => o.Id == id && o.IsActive);

    if (op is null) return null;

    var expected = MakeToken(op.Id, op.PinHash);
    if (!string.Equals(expected, tokenRaw, StringComparison.OrdinalIgnoreCase))
        return null;

    return op;
}



IResult Forbidden(string msg = "Forbidden")
    => Results.Json(new { message = msg }, statusCode: 403);


// =======================
// Reglas de permisos (fase 3 base)
// =======================
bool CanManageOperators(Operator op)
    => op.Role == OperatorRole.SuperAdmin || op.Role == OperatorRole.Admin;

bool CanDeleteOperator(Operator op, Operator target)
{
    // Solo SuperAdmin puede desactivar Admin / SuperAdmin
    if (target.Role == OperatorRole.SuperAdmin) return op.Role == OperatorRole.SuperAdmin;
    if (target.Role == OperatorRole.Admin) return op.Role == OperatorRole.SuperAdmin;

    // Admin puede desactivar roles menores
    return op.Role == OperatorRole.SuperAdmin || op.Role == OperatorRole.Admin;
}


// =======================
// DB migrate + seed mínimo
// =======================
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CashlessContext>();
    db.Database.Migrate();

    if (!db.Operators.Any())
    {
        var aGeneral = new Area { Name = "General", IsActive = true, Type = AreaType.General };
        var aBarra1 = new Area { Name = "Barra 1", IsActive = true, Type = AreaType.Barra };
        var aStand1 = new Area { Name = "Stand 1", IsActive = true, Type = AreaType.Stand };

        db.Areas.AddRange(aGeneral, aBarra1, aStand1);
        db.SaveChanges();

        db.Operators.AddRange(
            new Operator { Name = "Super Admin", Role = OperatorRole.SuperAdmin, AreaId = aGeneral.Id, PinHash = HashPin("9999"), IsActive = true },
            new Operator { Name = "Admin", Role = OperatorRole.Admin, AreaId = aGeneral.Id, PinHash = HashPin("1111"), IsActive = true },
            new Operator { Name = "Jefe Operativo", Role = OperatorRole.JefeOperativo, AreaId = aGeneral.Id, PinHash = HashPin("2222"), IsActive = true },
            new Operator { Name = "Jefe Barra 1", Role = OperatorRole.JefeDeBarra, AreaId = aBarra1.Id, PinHash = HashPin("3333"), IsActive = true },
            new Operator { Name = "Jefe Stand 1", Role = OperatorRole.JefeDeStand, AreaId = aStand1.Id, PinHash = HashPin("4444"), IsActive = true }
        );

        db.SaveChanges();
    }
}


app.MapGet("/api/reports1/summary", async (CashlessContext db, HttpRequest req,
    string? from, string? to, int? areaId) =>
{
    var op = await Authenticate(db, req);
    if (op is null) return Results.Unauthorized();

    // rango
    var fromDt = DateTime.TryParse(from, out var f) ? f.Date : DateTime.Today.AddDays(-6);
    var toDt   = DateTime.TryParse(to, out var t) ? t.Date.AddDays(1) : DateTime.Today.AddDays(1);

    // 👇 OJO: ajusta nombres si tus entidades difieren:
    // Ventas: idealmente desde Sales (si existe)
    var salesQ = db.Sales.AsQueryable()
        .Where(s => s.CreatedAt >= fromDt && s.CreatedAt < toDt);

    if (areaId.HasValue) salesQ = salesQ.Where(s => s.AreaId == areaId.Value);

    var totalVendido = await salesQ.SumAsync(s => (decimal?)s.Total) ?? 0m;
    var totalPropina = await salesQ.SumAsync(s => (decimal?)s.TipAmount) ?? 0m;
    var totalDonacion = await salesQ.SumAsync(s => (decimal?)s.DonationAmount) ?? 0m;
    var txCount = await salesQ.CountAsync();

    var userCount = await db.Users.CountAsync(); // total usuarios

    return Results.Ok(new {
        from = fromDt.ToString("yyyy-MM-dd"),
        to = toDt.AddDays(-1).ToString("yyyy-MM-dd"),
        totalVendido,
        totalPropina,
        totalDonacion,
        transacciones = txCount,
        usuarios = userCount,
        ticketPromedio = txCount > 0 ? totalVendido / txCount : 0m
    });
});

app.MapGet("/api/reports1/top-products", async (CashlessContext db, HttpRequest req,
    string? from, string? to, int? areaId, int? take) =>
{
    var op = await Authenticate(db, req);
    if (op is null) return Results.Unauthorized();

    var fromDt = DateTime.TryParse(from, out var f) ? f.Date : DateTime.Today.AddDays(-6);
    var toDt   = DateTime.TryParse(to, out var t) ? t.Date.AddDays(1) : DateTime.Today.AddDays(1);
    var limit = (take.HasValue && take.Value > 0 && take.Value <= 50) ? take.Value : 10;

    // 👇 Top productos desde SaleItems (ajusta nombres si difieren)
    var q = db.SaleItems
        .Where(i => i.Sale.CreatedAt >= fromDt && i.Sale.CreatedAt < toDt);

    if (areaId.HasValue) q = q.Where(i => i.Sale.AreaId == areaId.Value);

    var rows = await q
        .GroupBy(i => new { i.ProductId, i.Product.Name })
        .Select(g => new {
            productId = g.Key.ProductId,
            name = g.Key.Name,
            qty = g.Sum(x => x.Qty),
            amount = g.Sum(x => x.LineTotal)
        })
        .OrderByDescending(x => x.qty)
        .ThenByDescending(x => x.amount)
        .Take(limit)
        .ToListAsync();

    return Results.Ok(rows);
});


// =======================
// NFC UID (last read) + bloqueo 1 cobro por lectura
// =======================
string? lastUid = null;
string? pendingChargeUid = null; // “permiso” consumible para 1 cobro

app.MapPost("/uid", (UidRequest req) =>
{
    lastUid = (req.uid ?? "").Trim().ToUpperInvariant();
    Console.WriteLine($"UID leído: {lastUid}");
    return Results.Ok(new { ok = true });
});

app.MapGet("/last-uid", () =>
{
    // Nunca 404 para no spamear consola del dashboard.
    // Si no hay UID, devolvemos uid vacío.
    if (string.IsNullOrWhiteSpace(lastUid))
        return Results.Ok(new { uid = "" });

    pendingChargeUid = lastUid;

    var uid = lastUid;
    lastUid = null; // consumimos la lectura
    return Results.Ok(new { uid });
});
// =======================
// OperatorAreas (asignación de barras a colaboradores) - PROTEGIDO
// =======================
app.MapGet("/api/operators/{id:int}/areas", async Task<IResult> (int id, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var list = await db.OperatorAreas
        .Include(x => x.Area)
        .Where(x => x.OperatorId == id && x.IsActive)
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

app.MapPost("/api/operators/{id:int}/areas", async Task<IResult> (int id, OperatorArea dto, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    dto.OperatorId = id;
    db.OperatorAreas.Add(dto);
    await db.SaveChangesAsync();
    return Results.Ok(dto);
});


// ===================== AREAS (BARRAS) - PROTEGIDO (Type string + CustomType) =====================
app.MapGet("/api/areas", async Task<IResult> (CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var areas = await db.Areas
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

app.MapPost("/api/areas", async Task<IResult> (AreaUpsertDto dto, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(dto.Name))
        return Results.BadRequest(new { message = "Name is required." });

    if (!Enum.TryParse<AreaType>(dto.Type ?? "Barra", true, out var parsedType))
        parsedType = AreaType.Barra;

    var area = new Area
    {
        Name = dto.Name.Trim(),
        Type = parsedType,
        IsActive = dto.IsActive,
        CustomType = string.IsNullOrWhiteSpace(dto.CustomType) ? null : dto.CustomType.Trim()
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

app.MapPut("/api/areas/{id:int}", async Task<IResult> (int id, AreaUpsertDto dto, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var area = await db.Areas.FindAsync(id);
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

app.MapDelete("/api/areas/{id:int}", async Task<IResult> (int id, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var area = await db.Areas.FindAsync(id);
    if (area is null) return Results.NotFound(new { message = "Area no existe" });

    area.IsActive = false;
    await db.SaveChangesAsync();
    return Results.NoContent();
});


// ===================== PRODUCTS - PROTEGIDO =====================
app.MapGet("/api/products", async Task<IResult> (CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var list = await db.Products
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

app.MapPost("/api/products", async Task<IResult> (ProductUpsertDto dto, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(dto.Name))
        return Results.BadRequest(new { message = "Nombre requerido" });

    if (dto.Price < 0)
        return Results.BadRequest(new { message = "Precio inválido" });

    var p = new Product
    {
        Name = dto.Name.Trim(),
        Price = dto.Price,
        Category = string.IsNullOrWhiteSpace(dto.Category) ? null : dto.Category.Trim(),
        IsActive = dto.IsActive
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

app.MapPut("/api/products/{id:int}", async Task<IResult> (int id, ProductUpsertDto dto, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var p = await db.Products.FindAsync(id);
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

app.MapDelete("/api/products/{id:int}", async Task<IResult> (int id, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var p = await db.Products.FindAsync(id);
    if (p is null) return Results.NotFound(new { message = "Producto no existe" });

    p.IsActive = false;
    await db.SaveChangesAsync();
    return Results.NoContent();
});


// ===================== MENU POR AREA (AreaProduct) - PROTEGIDO =====================
app.MapGet("/api/areas/{areaId:int}/products", async Task<IResult> (int areaId, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var area = await db.Areas.FindAsync(areaId);
    if (area is null) return Results.NotFound(new { message = "Area no existe" });

    var list = await db.AreaProducts
        .Include(ap => ap.Product)
        .Where(ap => ap.AreaId == areaId)
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

app.MapPost("/api/areas/{areaId:int}/products", async Task<IResult> (int areaId, AreaProductCreateDto dto, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var area = await db.Areas.FindAsync(areaId);
    if (area is null) return Results.NotFound(new { message = "Area no existe" });

    var product = await db.Products.FindAsync(dto.ProductId);
    if (product is null) return Results.NotFound(new { message = "Producto no existe" });

    var exists = await db.AreaProducts.AnyAsync(x => x.AreaId == areaId && x.ProductId == dto.ProductId);
    if (exists) return Results.BadRequest(new { message = "Ese producto ya está en el menú de esta barra." });

    if (dto.PriceOverride is not null && dto.PriceOverride < 0)
        return Results.BadRequest(new { message = "PriceOverride inválido" });

    var link = new AreaProduct
    {
        AreaId = areaId,
        ProductId = dto.ProductId,
        PriceOverride = dto.PriceOverride,
        IsActive = dto.IsActive
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

app.MapPut("/api/areas/{areaId:int}/products/{areaProductId:int}", async Task<IResult> (int areaId, int areaProductId, AreaProductUpdateDto dto, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var link = await db.AreaProducts
        .Include(x => x.Product)
        .FirstOrDefaultAsync(x => x.Id == areaProductId && x.AreaId == areaId);

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

app.MapDelete("/api/areas/{areaId:int}/products/{areaProductId:int}", async Task<IResult> (int areaId, int areaProductId, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var link = await db.AreaProducts.FirstOrDefaultAsync(x => x.Id == areaProductId && x.AreaId == areaId);
    if (link is null) return Results.NotFound(new { message = "No existe ese vínculo." });

    db.AreaProducts.Remove(link);
    await db.SaveChangesAsync();
    return Results.NoContent();
});


// ===================== OPERATORS (COLABORADORES) - PROTEGIDO =====================
app.MapGet("/api/operators", async Task<IResult> (CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();
    if (!CanManageOperators(op)) return Forbidden("No tienes permisos para ver colaboradores.");

    var list = await db.Operators
        .Include(o => o.Area)
        .OrderBy(o => o.Name)
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

app.MapPost("/api/operators", async Task<IResult> (CashlessContext db, HttpContext http, OperatorUpsertDto dto) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();
    if (!CanManageOperators(op)) return Forbidden("No tienes permisos para crear colaboradores.");

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
        areaId = await db.Areas.OrderBy(a => a.Id).Select(a => a.Id).FirstOrDefaultAsync();

    if (areaId <= 0) return Results.BadRequest(new { message = "No hay Areas creadas para asignar." });

    var areaExists = await db.Areas.AnyAsync(a => a.Id == areaId);
    if (!areaExists) return Results.BadRequest(new { message = "AreaId inválido" });

    var entity = new Operator
    {
        Name = dto.Name.Trim(),
        Role = parsedRole,
        AreaId = areaId,
        PinHash = HashPin(dto.Pin.Trim()),
        IsActive = dto.IsActive
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

app.MapPut("/api/operators/{id:int}", async Task<IResult> (int id, CashlessContext db, HttpContext http, OperatorUpsertDto dto) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();
    if (!CanManageOperators(op)) return Forbidden("No tienes permisos para editar colaboradores.");

    var target = await db.Operators.FindAsync(id);
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
        var areaExists = await db.Areas.AnyAsync(a => a.Id == dto.AreaId.Value);
        if (!areaExists) return Results.BadRequest(new { message = "AreaId inválido" });
        target.AreaId = dto.AreaId.Value;
    }

    if (!string.IsNullOrWhiteSpace(dto.Pin))
        target.PinHash = HashPin(dto.Pin.Trim());

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

app.MapDelete("/api/operators/{id:int}", async Task<IResult> (int id, CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();
    if (!CanManageOperators(op)) return Forbidden("No tienes permisos para desactivar colaboradores.");

    var target = await db.Operators.FindAsync(id);
    if (target is null) return Results.NotFound(new { message = "Operador no existe" });

    if (target.Id == op.Id)
        return Results.BadRequest(new { message = "No puedes desactivarte a ti mismo." });

    if (!CanDeleteOperator(op, target))
        return Forbidden("No tienes permisos para desactivar ese rol.");

    target.IsActive = false;
    await db.SaveChangesAsync();
    return Results.NoContent();
});


// =======================
// PÚBLICO (para login / selects en POS)
// =======================
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

app.MapPost("/auth/login", async (CashlessContext db, LoginRequest req) =>
{
    var op = await db.Operators
        .Include(o => o.Area)
        .FirstOrDefaultAsync(o => o.Id == req.OperatorId && o.IsActive);

    if (op is null)
        return Results.NotFound(new { message = "Operador no existe o inactivo" });

    if (!string.Equals(HashPin(req.Pin.Trim()), op.PinHash, StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { message = "PIN incorrecto" });

    return Results.Ok(new
    {
        operatorId = op.Id,
        name = op.Name,
        role = op.Role.ToString(),
        areaId = op.AreaId,
        area = op.Area != null ? op.Area.Name : null,
        token = MakeToken(op.Id, op.PinHash)
    });
});


// =======================
// PROTEGIDO: Cards lookup
// =======================
app.MapGet("/cards/{uid}", async Task<IResult> (CashlessContext db, HttpContext http, string uid) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var clean = (uid ?? "").Trim().ToUpperInvariant();

    var card = await db.Cards
        .Include(c => c.User)
        .FirstOrDefaultAsync(c => c.Uid == clean);

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


// =======================
// PROTEGIDO: Users + assign card
// =======================
app.MapGet("/users", async Task<IResult> (CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var users = await db.Users
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

app.MapPost("/users", async Task<IResult> (CashlessContext db, HttpContext http, CreateUserRequest req) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(req.Name))
        return Results.BadRequest(new { message = "Nombre requerido" });

    var user = new User
    {
        Name = req.Name.Trim(),
        Email = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim(),
        Phone = string.IsNullOrWhiteSpace(req.Phone) ? null : req.Phone.Trim()
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

app.MapPost("/assign-card", async Task<IResult> (CashlessContext db, HttpContext http, AssignCardRequest req) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    if (req.UserId <= 0) return Results.BadRequest(new { message = "UserId inválido" });
    if (string.IsNullOrWhiteSpace(req.Uid)) return Results.BadRequest(new { message = "UID requerido" });

    var uid = req.Uid.Trim().ToUpperInvariant();

    var user = await db.Users.FindAsync(req.UserId);
    if (user is null) return Results.NotFound(new { message = "Usuario no existe" });

    var exists = await db.Cards.AnyAsync(c => c.Uid == uid);
    if (exists) return Results.BadRequest(new { message = "Pulsera ya asignada" });

    var card = new Card { Uid = uid, UserId = user.Id };
    db.Cards.Add(card);
    await db.SaveChangesAsync();

    return Results.Ok(new { card.Id, card.Uid, card.UserId });
});


// =======================
// PROTEGIDO: Balance/Topup/Charge (Charge con 1 cobro por lectura)
// =======================
app.MapGet("/balance/{uid}", async Task<IResult> (CashlessContext db, HttpContext http, string uid) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var clean = (uid ?? "").Trim().ToUpperInvariant();

    var card = await db.Cards
        .Include(c => c.User)
        .FirstOrDefaultAsync(c => c.Uid == clean);

    if (card is null)
        return Results.NotFound(new { message = "Pulsera no asignada" });

    return Results.Ok(new
    {
        userName = card.User.Name,
        balance = card.User.Balance
    });
});

app.MapPost("/topup", async Task<IResult> (CashlessContext db, HttpContext http, TopupRequest req) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var uid = (req.Uid ?? "").Trim().ToUpperInvariant();
    if (string.IsNullOrWhiteSpace(uid)) return Results.BadRequest(new { message = "UID requerido" });
    if (req.Amount <= 0) return Results.BadRequest(new { message = "Monto inválido" });

    var card = await db.Cards.Include(c => c.User).FirstOrDefaultAsync(c => c.Uid == uid);
    if (card is null) return Results.NotFound(new { message = "Pulsera no asignada" });

    card.User.Balance += req.Amount;

    db.Transactions.Add(new Transaction
    {
        UserId = card.User.Id,
        CardUid = card.Uid,
        Amount = req.Amount,
        Type = TransactionType.TopUp,
        CreatedAt = DateTime.UtcNow
    });

    await db.SaveChangesAsync();
    return Results.Ok(new { newBalance = card.User.Balance });
});

app.MapPost("/charge", async Task<IResult> (CashlessContext db, HttpContext http, ChargeRequest req) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var uid = (req.Uid ?? "").Trim().ToUpperInvariant();
    if (string.IsNullOrWhiteSpace(uid)) return Results.BadRequest(new { message = "UID requerido" });
    if (req.Amount <= 0) return Results.BadRequest(new { message = "Monto inválido" });

    // 🔒 solo 1 cobro por lectura
    if (pendingChargeUid == null || pendingChargeUid != uid)
        return Results.BadRequest(new { message = "Esta pulsera ya fue usada o no fue leída recientemente" });

    pendingChargeUid = null; // consume permiso

    var card = await db.Cards.Include(c => c.User).FirstOrDefaultAsync(c => c.Uid == uid);
    if (card is null) return Results.NotFound(new { message = "Pulsera no asignada" });

    if (card.User.Balance < req.Amount)
        return Results.BadRequest(new { message = "Saldo insuficiente" });

    card.User.Balance -= req.Amount;
    card.User.TotalSpent += req.Amount;

    db.Transactions.Add(new Transaction
    {
        UserId = card.User.Id,
        CardUid = uid,
        Amount = req.Amount,
        Type = TransactionType.Charge,
        CreatedAt = DateTime.UtcNow
    });

    await db.SaveChangesAsync();
    return Results.Ok(new { newBalance = card.User.Balance });
});

// =======================
// PROTEGIDO: Charge V2 (propina + donación + items) + datos para reportes
// - No rompe esquema: guarda "items/tip/donation" dentro de Transaction.Note (JSON)
// - Crea 1 tx de SUBTOTAL + 1 tx de TIP (si aplica) + 1 tx de DONATION (si aplica)
// =======================

app.MapPost("/charge-v2", async Task<IResult> (CashlessContext db, HttpContext http, ChargeRequestV2 req) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var uid = (req.Uid ?? "").Trim().ToUpperInvariant();
    if (string.IsNullOrWhiteSpace(uid)) return Results.BadRequest(new { message = "UID requerido" });
    if (req.AreaId <= 0) return Results.BadRequest(new { message = "AreaId inválido" });
    if (req.OperatorId <= 0) return Results.BadRequest(new { message = "OperatorId inválido" });
    if (req.Items is null || req.Items.Count == 0) return Results.BadRequest(new { message = "Items requerido" });

    if (req.TipAmount < 0) return Results.BadRequest(new { message = "TipAmount inválido" });
    if (req.DonationPercent < 0 || req.DonationPercent > 100) return Results.BadRequest(new { message = "DonationPercent inválido (0-100)" });

    // 🔒 solo 1 cobro por lectura
    if (pendingChargeUid == null || pendingChargeUid != uid)
        return Results.BadRequest(new { message = "Esta pulsera ya fue usada o no fue leída recientemente" });

    pendingChargeUid = null; // consume permiso

    var card = await db.Cards.Include(c => c.User).FirstOrDefaultAsync(c => c.Uid == uid);
    if (card is null) return Results.NotFound(new { message = "Pulsera no asignada" });

    // Trae menú del área para precio efectivo (override o base)
    var menu = await db.AreaProducts
        .Include(ap => ap.Product)
        .Where(ap => ap.AreaId == req.AreaId && ap.IsActive && ap.Product.IsActive)
        .ToListAsync();

    var priceByProductId = menu.ToDictionary(
        ap => ap.ProductId,
        ap => (ap.PriceOverride ?? ap.Product.Price)
    );

    // Calcula subtotal y arma items para auditoría + reportes
    decimal subtotal = 0m;
    var noteItems = new List<object>();

    foreach (var it in req.Items)
    {
        if (it.Qty <= 0) return Results.BadRequest(new { message = "Qty inválido" });

        if (!priceByProductId.TryGetValue(it.ProductId, out var unit))
            return Results.BadRequest(new { message = $"Producto {it.ProductId} no está activo en el menú del área {req.AreaId}" });

        var line = unit * it.Qty;
        subtotal += line;

        var name = menu.First(ap => ap.ProductId == it.ProductId).Product.Name;

        noteItems.Add(new
        {
            productId = it.ProductId,
            name,
            qty = it.Qty,
            unitPrice = unit,
            lineTotal = line
        });
    }

    var donationAmount = req.DonationPercent > 0 ? Math.Round(subtotal * (req.DonationPercent / 100m), 2) : 0m;
    var tipAmount = Math.Round(req.TipAmount, 2);

    var grandTotal = subtotal + tipAmount + donationAmount;
    if (grandTotal <= 0) return Results.BadRequest(new { message = "Monto inválido" });

    if (card.User.Balance < grandTotal)
        return Results.BadRequest(new { message = "Saldo insuficiente" });

    // Aplica cargo al usuario
    card.User.Balance -= grandTotal;
    card.User.TotalSpent += grandTotal;

    // 1) SUBTOTAL
    var saleMeta = new
    {
        kind = "SALE_SUBTOTAL",
        areaId = req.AreaId,
        operatorId = req.OperatorId,
        subtotal,
        items = noteItems
    };
    db.Transactions.Add(new Transaction
    {
        UserId = card.User.Id,
        CardUid = uid,
        Amount = subtotal,
        Type = TransactionType.Charge,
        Note = System.Text.Json.JsonSerializer.Serialize(saleMeta),
        CreatedAt = DateTime.UtcNow
    });

    // 2) TIP
    if (tipAmount > 0)
    {
        var tipMeta = new { kind = "TIP", areaId = req.AreaId, operatorId = req.OperatorId, tipAmount };
        db.Transactions.Add(new Transaction
        {
            UserId = card.User.Id,
            CardUid = uid,
            Amount = tipAmount,
            Type = TransactionType.Charge,
            Note = System.Text.Json.JsonSerializer.Serialize(tipMeta),
            CreatedAt = DateTime.UtcNow
        });
    }

    // 3) DONATION
    if (donationAmount > 0)
    {
        var donMeta = new
        {
            kind = "DONATION",
            areaId = req.AreaId,
            operatorId = req.OperatorId,
            donationPercent = req.DonationPercent,
            donationAmount,
            donationProjectId = req.DonationProjectId
        };
        db.Transactions.Add(new Transaction
        {
            UserId = card.User.Id,
            CardUid = uid,
            Amount = donationAmount,
            Type = TransactionType.Charge,
            Note = System.Text.Json.JsonSerializer.Serialize(donMeta),
            CreatedAt = DateTime.UtcNow
        });
    }

    await db.SaveChangesAsync();

    return Results.Ok(new
    {
        ok = true,
        uid,
        subtotal,
        tipAmount,
        donationAmount,
        grandTotal,
        newBalance = card.User.Balance
    });
});


// =======================
// PROTEGIDO: REPORTES (server-side)
// - summary: total vendido, propina, donación, usuarios, transacciones
// - top-products: agrega por items guardados en Transaction.Note (SALE_SUBTOTAL)
// =======================

static DateTime? ParseDate(string? s, bool endOfDay = false)
{
    if (string.IsNullOrWhiteSpace(s)) return null;
    if (!DateTime.TryParse(s, out var d)) return null;
    return endOfDay ? d.Date.AddDays(1).AddTicks(-1) : d.Date;
}

app.MapGet("/api/reports/summary", async Task<IResult> (CashlessContext db, HttpContext http, string? from, string? to) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var f = ParseDate(from) ?? DateTime.MinValue;
    var t = ParseDate(to, endOfDay: true) ?? DateTime.MaxValue;

    var userCount = await db.Users.CountAsync();

    var q = db.Transactions.Where(x => x.CreatedAt >= f && x.CreatedAt <= t);

    var txCount = await q.CountAsync();

    // Total vendido (incluye tip/donación) = suma de cargos
    var totalCharged = await q.Where(x => x.Type == TransactionType.Charge).SumAsync(x => (decimal?)x.Amount) ?? 0m;

    // Separaciones por kind en Note
    // Tip: como Note es JSON, filtramos por Contains para no romper por provider Sqlite
    var totalTips = await q.Where(x => x.Type == TransactionType.Charge && x.Note != null && x.Note.Contains("\"kind\":\"TIP\""))
        .SumAsync(x => (decimal?)x.Amount) ?? 0m;

    var totalDonations = await q.Where(x => x.Type == TransactionType.Charge && x.Note != null && x.Note.Contains("\"kind\":\"DONATION\""))
        .SumAsync(x => (decimal?)x.Amount) ?? 0m;

    var totalSalesSubtotal = await q.Where(x => x.Type == TransactionType.Charge && x.Note != null && x.Note.Contains("\"kind\":\"SALE_SUBTOTAL\""))
        .SumAsync(x => (decimal?)x.Amount) ?? 0m;

    return Results.Ok(new
    {
        from = f,
        to = t,
        userCount,
        txCount,
        totalSold = totalSalesSubtotal,     // “venta” sin tip/donación
        totalTips,
        totalDonations,
        totalCharged                        // venta+tip+donación (lo que realmente se descontó)
    });
});

app.MapGet("/api/reports/top-products", async Task<IResult> (CashlessContext db, HttpContext http, string? from, string? to, int take = 10) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var f = ParseDate(from) ?? DateTime.MinValue;
    var t = ParseDate(to, endOfDay: true) ?? DateTime.MaxValue;

    // Trae transacciones con items guardados en Note (SALE_SUBTOTAL)
    var tx = await db.Transactions
        .Where(x => x.Type == TransactionType.Charge
                    && x.CreatedAt >= f && x.CreatedAt <= t
                    && x.Note != null
                    && x.Note.Contains("\"kind\":\"SALE_SUBTOTAL\""))
        .Select(x => new { x.Id, x.Note })
        .ToListAsync();

    var agg = new Dictionary<int, (string Name, int Qty, decimal Amount)>();

    foreach (var row in tx)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(row.Note!);
            if (!doc.RootElement.TryGetProperty("items", out var items) || items.ValueKind != System.Text.Json.JsonValueKind.Array)
                continue;

            foreach (var it in items.EnumerateArray())
            {
                if (!it.TryGetProperty("productId", out var pidEl)) continue;
                var pid = pidEl.GetInt32();

                var name = it.TryGetProperty("name", out var nEl) ? nEl.GetString() ?? $"Producto {pid}" : $"Producto {pid}";
                var qty = it.TryGetProperty("qty", out var qEl) ? qEl.GetInt32() : 0;
                var amt = it.TryGetProperty("lineTotal", out var aEl) ? aEl.GetDecimal() : 0m;

                if (qty <= 0) continue;

                if (!agg.TryGetValue(pid, out var prev))
                    agg[pid] = (name, qty, amt);
                else
                    agg[pid] = (prev.Name, prev.Qty + qty, prev.Amount + amt);
            }
        }
        catch { /* ignora notes corruptas */ }
    }

    var rows = agg
        .Select(kv => new { productId = kv.Key, name = kv.Value.Name, qty = kv.Value.Qty, amount = kv.Value.Amount })
        .OrderByDescending(x => x.qty)
        .ThenByDescending(x => x.amount)
        .Take(Math.Clamp(take, 1, 50))
        .ToList();

    return Results.Ok(new { from = f, to = t, items = rows });
});


app.MapGet("/transactions/{uid}", async Task<IResult> (CashlessContext db, HttpContext http, string uid) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var clean = (uid ?? "").Trim().ToUpperInvariant();

    var card = await db.Cards.Include(c => c.User).FirstOrDefaultAsync(c => c.Uid == clean);
    if (card is null) return Results.NotFound(new { message = "Pulsera no asignada" });

    var tx = await db.Transactions
        .Where(t => t.UserId == card.User.Id)
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

app.MapPut("/users/{id}/contact", async Task<IResult> (CashlessContext db, HttpContext http, int id, UpdateUserContactRequest req) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var user = await db.Users.FindAsync(id);
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

app.MapPost("/reassign-card", async Task<IResult> (CashlessContext db, HttpContext http, ReassignCardRequest req) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    if (req.UserId <= 0) return Results.BadRequest(new { message = "UserId inválido" });
    if (string.IsNullOrWhiteSpace(req.Uid)) return Results.BadRequest(new { message = "UID requerido" });

    var uid = req.Uid.Trim().ToUpperInvariant();

    var user = await db.Users.FindAsync(req.UserId);
    if (user is null) return Results.NotFound(new { message = "Usuario no existe" });

    var uidExists = await db.Cards.AnyAsync(c => c.Uid == uid);
    if (uidExists) return Results.BadRequest(new { message = "Pulsera ya asignada" });

    var card = await db.Cards.FirstOrDefaultAsync(c => c.UserId == user.Id);
    string? oldUid = null;

    if (card is null)
        db.Cards.Add(new Card { Uid = uid, UserId = user.Id });
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

string[] PERM_CATALOG = new[]
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

var ROLE_PERMS = new Dictionary<OperatorRole, HashSet<string>>()
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

bool HasPerm(Operator op, string perm)
{
    return ROLE_PERMS.TryGetValue(op.Role, out var set) && set.Contains(perm);
}

app.MapGet("/api/permissions", async (CashlessContext db, HttpContext http) =>
{
    var op = await Authenticate(db, http.Request);
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

// =======================
// REPORTES (v2) - basado en Transactions (porque /charge guarda Transaction)
// =======================
app.MapGet("/api/reports2/summary", async Task<IResult> (CashlessContext db, HttpContext http, string? from, string? to) =>
{
    var op = await Authenticate(db, http.Request);
    if (op is null) return Results.Unauthorized();

    var fromDt = DateTime.TryParse(from, out var f) ? f.Date : DateTime.Today.AddDays(-6);
    var toDt = DateTime.TryParse(to, out var t) ? t.Date.AddDays(1) : DateTime.Today.AddDays(1); // exclusivo

    var chargesQ = db.Transactions
        .Where(x => x.Type == TransactionType.Charge && x.CreatedAt >= fromDt && x.CreatedAt < toDt);

    var totalVendido = await chargesQ.SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var txCount = await chargesQ.CountAsync();
    var userCount = await db.Users.CountAsync();

    // OJO: propina/donación hoy NO se guardan en DB (tu /charge no las maneja),
    // así que por ahora regresan 0 hasta que implementemos ChargeRequestV2 y persistencia.
    var totalPropina = 0m;
    var totalDonacion = 0m;

    return Results.Ok(new
    {
        from = fromDt.ToString("yyyy-MM-dd"),
        to = toDt.AddDays(-1).ToString("yyyy-MM-dd"),
        totalVendido,
        totalPropina,
        totalDonacion,
        transacciones = txCount,
        usuarios = userCount,
        ticketPromedio = txCount > 0 ? totalVendido / txCount : 0m
    });
});



app.Run();


// =======================
// Records / DTOs (AL FINAL)
// =======================
record UidRequest(string uid);
record LoginRequest(int OperatorId, string Pin);

// USERS / CARDS
record CreateUserRequest(string Name, string? Email, string? Phone);
record AssignCardRequest(int UserId, string Uid);
record TopupRequest(string Uid, decimal Amount);
record ChargeRequest(string Uid, decimal Amount);
record UpdateUserContactRequest(string? Email, string? Phone);
record ReassignCardRequest(int UserId, string Uid);

// AREAS
record AreaUpsertDto(string Name, string? Type, bool IsActive, string? CustomType);

// PRODUCTS
record ProductUpsertDto(string Name, decimal Price, string? Category, bool IsActive);

// AREA MENU (links)
record AreaProductCreateDto(int ProductId, decimal? PriceOverride, bool IsActive);
record AreaProductUpdateDto(decimal? PriceOverride, bool IsActive);

// OPERATORS
record OperatorUpsertDto(string Name, string? Role, string? Pin, int? AreaId, bool IsActive);


// ====== CHARGE V2 DTOs (para /charge-v2) ======
record ChargeItemDto(int ProductId, int Qty);

record ChargeRequestV2(
    string? Uid,
    int AreaId,
    int OperatorId,
    decimal TipAmount,
    decimal DonationPercent,
    int? DonationProjectId,
    List<ChargeItemDto> Items
);
