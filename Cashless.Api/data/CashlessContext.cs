using Microsoft.EntityFrameworkCore;
using Cashless.Api.Models;

namespace Cashless.Api.Data;

public class CashlessContext : DbContext
{
    public CashlessContext(DbContextOptions<CashlessContext> options)
        : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Card> Cards => Set<Card>();
    public DbSet<Transaction> Transactions => Set<Transaction>();

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<Festival> Festivals => Set<Festival>();

    public DbSet<Area> Areas => Set<Area>();
    public DbSet<Operator> Operators => Set<Operator>();
    public DbSet<OperatorArea> OperatorAreas => Set<OperatorArea>();

    public DbSet<Product> Products => Set<Product>();
    public DbSet<AreaProduct> AreaProducts => Set<AreaProduct>();

    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Tenant>()
            .HasIndex(t => t.Name);

        // Area -> Operators
        modelBuilder.Entity<Area>()
            .HasMany(a => a.Operators)
            .WithOne(o => o.Area)
            .HasForeignKey(o => o.AreaId)
            .OnDelete(DeleteBehavior.SetNull);

        // UID único
        modelBuilder.Entity<Card>()
            .HasIndex(c => c.Uid)
            .IsUnique();

        // User -> Cards
        modelBuilder.Entity<User>()
            .HasMany(u => u.Cards)
            .WithOne(c => c.User)
            .HasForeignKey(c => c.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // User -> Transactions
        modelBuilder.Entity<User>()
            .HasMany(u => u.Transactions)
            .WithOne(t => t.User)
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Products: index por nombre
        modelBuilder.Entity<Product>()
            .HasIndex(p => p.Name);

        // AreaProduct: evita duplicados (AreaId + ProductId)
        modelBuilder.Entity<AreaProduct>()
            .HasIndex(ap => new { ap.AreaId, ap.ProductId })
            .IsUnique();

        // AreaProduct relations
        modelBuilder.Entity<AreaProduct>()
            .HasOne(ap => ap.Area)
            .WithMany()
            .HasForeignKey(ap => ap.AreaId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<AreaProduct>()
            .HasOne(ap => ap.Product)
            .WithMany()
            .HasForeignKey(ap => ap.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        // Sales
        modelBuilder.Entity<User>()
            .HasMany<Sale>()
            .WithOne(s => s.User)
            .HasForeignKey(s => s.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Sale>()
            .HasMany(s => s.Items)
            .WithOne(i => i.Sale)
            .HasForeignKey(i => i.SaleId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
