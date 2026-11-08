using Microsoft.EntityFrameworkCore;
using RaceDayApi.Server.Models;
using System.Reflection.Emit;

namespace RaceDayApi.Server.Data;

public class RaceDayDbContext : DbContext
{
    public RaceDayDbContext(DbContextOptions<RaceDayDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Venue> Venues => Set<Venue>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Registration> Registrations => Set<Registration>();
    public DbSet<TimingResult> TimingResults => Set<TimingResult>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();

        modelBuilder.Entity<Event>()
            .HasOne(e => e.Venue)
            .WithMany(v => v.Events)
            .HasForeignKey(e => e.VenueId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Category>()
            .HasOne(c => c.Event)
            .WithMany(e => e.Categories)
            .HasForeignKey(c => c.EventId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Registration>()
            .HasOne(r => r.User)
            .WithMany(u => u.Registrations)
            .HasForeignKey(r => r.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Registration>()
            .HasOne(r => r.Category)
            .WithMany(c => c.Registrations)
            .HasForeignKey(r => r.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Registration>()
            .HasIndex(r => new { r.UserId, r.CategoryId })
            .IsUnique();

        modelBuilder.Entity<Registration>()
            .HasOne(r => r.Event)
            .WithMany(e => e.Registrations)
            .HasForeignKey(r => r.EventId)
            .OnDelete(DeleteBehavior.Restrict);

        // Race numbers are unique per event (also guards concurrent registrations)
        modelBuilder.Entity<Registration>()
            .HasIndex(r => new { r.EventId, r.RaceNumber })
            .IsUnique();

        modelBuilder.Entity<Event>()
            .HasOne(e => e.Organizer)
            .WithMany()
            .HasForeignKey(e => e.OrganizerId)
            .OnDelete(DeleteBehavior.SetNull);

        // Store enums as readable strings
        modelBuilder.Entity<Event>().Property(e => e.Status).HasConversion<string>().HasMaxLength(20);
        modelBuilder.Entity<Registration>().Property(r => r.Status).HasConversion<string>().HasMaxLength(20);
        modelBuilder.Entity<Registration>().Property(r => r.PaymentStatus).HasConversion<string>().HasMaxLength(20);
        modelBuilder.Entity<TimingResult>().Property(t => t.Status).HasConversion<string>().HasMaxLength(20);
        modelBuilder.Entity<User>().Property(u => u.Gender).HasConversion<string>().HasMaxLength(20);
        modelBuilder.Entity<Category>().Property(c => c.Gender).HasConversion<string>().HasMaxLength(20);

        modelBuilder.Entity<RefreshToken>()
            .HasIndex(t => t.TokenHash)
            .IsUnique();

        modelBuilder.Entity<RefreshToken>()
            .HasOne(t => t.User)
            .WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<TimingResult>()
            .HasOne(t => t.Registration)
            .WithOne(r => r.TimingResult)
            .HasForeignKey<TimingResult>(t => t.RegistrationId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}