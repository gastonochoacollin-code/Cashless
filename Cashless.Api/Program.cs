using Cashless.Api.Data;
using Cashless.Api.Models;
using Cashless.Api.Services.Auth;
using Cashless.Api.Services.Infra;
using Cashless.Api.Services.Reportes;
using Cashless.Api.Endpoints;
using Microsoft.EntityFrameworkCore;

Console.WriteLine("🔥 PROGRAM.CS (Cashless.Api) 🔥");

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=cashless.db";

builder.Services.AddDbContext<CashlessContext>(opt =>
    opt.UseSqlite(connectionString));
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddSingleton<IUidState, InMemoryUidState>();
builder.Services.AddScoped<IReportService, ReportService>();
builder.Services.AddCors(opt =>
    opt.AddPolicy("local-dev", p =>
        p.WithOrigins("http://localhost:5237")
         .AllowAnyHeader()
         .AllowAnyMethod()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

app.UseDefaultFiles();
app.Use(async (context, next) =>
{
    if (context.Request.Path.Value?.EndsWith(".html", StringComparison.OrdinalIgnoreCase) == true)
    {
        context.Response.Headers["Content-Type"] = "text/html; charset=utf-8";
    }
    await next();
});
app.UseStaticFiles();
app.UseCors("local-dev");

if (app.Environment.IsDevelopment())
{
    app.MapGet("/api/dev/diag/operators", async (CashlessContext db) =>
    {
        var total = await db.Operators.CountAsync();
        var active = await db.Operators.Where(o => o.IsActive).CountAsync();
        var byTenant = await db.Operators
            .GroupBy(o => o.TenantId)
            .Select(g => new { tenantId = g.Key, count = g.Count(), active = g.Count(x => x.IsActive) })
            .OrderBy(x => x.tenantId)
            .ToListAsync();

        var tenants = await db.Tenants
            .OrderBy(t => t.Id)
            .Select(t => new { t.Id, t.Name })
            .Take(20)
            .ToListAsync();

        return Results.Ok(new
        {
            totalOperators = total,
            activeOperators = active,
            activeOperatorsByTenant = byTenant,
            firstTenants = tenants
        });
    });
}





// =======================
// DB migrate + seed mínimo
// =======================
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CashlessContext>();
    var auth = scope.ServiceProvider.GetRequiredService<IAuthService>();
    db.Database.Migrate();

    if (!db.Tenants.Any())
    {
        db.Tenants.Add(new Tenant { Name = "Default" });
        db.SaveChanges();
    }

    var defaultTenantId = db.Tenants.OrderBy(t => t.Id).Select(t => t.Id).FirstOrDefault();

    // Fix legacy TenantId=0 when single-tenant
    if (db.Tenants.Count() == 1 && defaultTenantId > 0)
    {
        int Fix<TEntity>(IQueryable<TEntity> query, string label) where TEntity : class
        {
            var updated = query.ExecuteUpdate(s => s.SetProperty(e => EF.Property<int>(e, "TenantId"), defaultTenantId));
            if (updated > 0)
                Console.WriteLine($"[TENANT-FIX] {label}: {updated} rows updated to TenantId={defaultTenantId}");
            return updated;
        }

        Fix(db.Operators.Where(o => o.TenantId == 0), "Operators");
        Fix(db.Areas.Where(a => a.TenantId == 0), "Areas");
        Fix(db.Users.Where(u => u.TenantId == 0), "Users");
        Fix(db.Products.Where(p => p.TenantId == 0), "Products");
        Fix(db.Cards.Where(c => c.TenantId == 0), "Cards");
        Fix(db.Transactions.Where(t => t.TenantId == 0), "Transactions");
        Fix(db.Sales.Where(s => s.TenantId == 0), "Sales");
        Fix(db.SaleItems.Where(si => si.TenantId == 0), "SaleItems");
        Fix(db.OperatorAreas.Where(oa => oa.TenantId == 0), "OperatorAreas");
        Fix(db.AreaProducts.Where(ap => ap.TenantId == 0), "AreaProducts");
        Fix(db.Festivals.Where(f => f.TenantId == 0), "Festivals");
    }

    if (!db.Festivals.Any(f => f.TenantId == defaultTenantId))
    {
        var today = DateTime.UtcNow.Date;
        db.Festivals.Add(new Festival
        {
            Name = "Festival Default",
            StartDate = today,
            EndDate = today.AddDays(30),
            IsActive = true,
            TenantId = defaultTenantId
        });
        db.SaveChanges();
    }

    if (!db.Operators.Any(o => o.TenantId == defaultTenantId))
    {
        var aGeneral = new Area { Name = "General", IsActive = true, Type = AreaType.General, TenantId = defaultTenantId };
        var aBarra1 = new Area { Name = "Barra 1", IsActive = true, Type = AreaType.Barra, TenantId = defaultTenantId };
        var aStand1 = new Area { Name = "Stand 1", IsActive = true, Type = AreaType.Stand, TenantId = defaultTenantId };

        db.Areas.AddRange(aGeneral, aBarra1, aStand1);
        db.SaveChanges();

        db.Operators.AddRange(
            new Operator { Name = "Super Admin", Role = OperatorRole.SuperAdmin, AreaId = aGeneral.Id, PinHash = auth.HashPin("9999"), IsActive = true, TenantId = defaultTenantId },
            new Operator { Name = "Admin", Role = OperatorRole.Admin, AreaId = aGeneral.Id, PinHash = auth.HashPin("1111"), IsActive = true, TenantId = defaultTenantId },
            new Operator { Name = "Jefe Operativo", Role = OperatorRole.JefeOperativo, AreaId = aGeneral.Id, PinHash = auth.HashPin("2222"), IsActive = true, TenantId = defaultTenantId },
            new Operator { Name = "Jefe Barra 1", Role = OperatorRole.JefeDeBarra, AreaId = aBarra1.Id, PinHash = auth.HashPin("3333"), IsActive = true, TenantId = defaultTenantId },
            new Operator { Name = "Jefe Stand 1", Role = OperatorRole.JefeDeStand, AreaId = aStand1.Id, PinHash = auth.HashPin("4444"), IsActive = true, TenantId = defaultTenantId }
        );

        db.SaveChanges();
    }
}


app.MapReportsEndpoints();
app.MapPosEndpoints();
app.MapAdminEndpoints();
app.MapAuthEndpoints();
app.Run();

















