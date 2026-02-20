using Cashless.Api.Data;
using Cashless.Api.Models;
using Cashless.Api.Services.Auth;
using Cashless.Api.Services.Infra;
using Cashless.Api.Services.Reportes;
using Cashless.Api.Endpoints;
using Microsoft.EntityFrameworkCore;

Console.WriteLine("🔥 PROGRAM.CS (Cashless.Api) 🔥");

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<CashlessContext>(opt =>
    opt.UseSqlite("Data Source=cashless.db"));
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddSingleton<IUidState, InMemoryUidState>();
builder.Services.AddScoped<IReportService, ReportService>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

app.UseDefaultFiles();
app.UseStaticFiles();






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

    if (!db.Operators.Any())
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

















