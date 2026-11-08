using RaceDayApi.Server.Models;

namespace RaceDayApi.Server.Data;

/// <summary>A fixed account created by the demo seed (development and manual testing only).</summary>
public record DemoUser(string Email, string Password, string FullName, string Role, DateOnly? DateOfBirth = null, Gender? Gender = null, bool IsActive = true);

/// <summary>Startup data: the first venue, the optional admin and, on request, one demo user per type.</summary>
public static class DatabaseSeeder
{
    /// <summary>
    /// One account per kind of user, so every role and edge case can be tried by hand. Enabled with
    /// <c>Seed:DemoUsers=true</c> (set in appsettings.Development.json). Never enable it in production:
    /// the passwords are public.
    /// </summary>
    public static readonly IReadOnlyList<DemoUser> DemoUsers =
    [
        new("organizer@raceday.local", "Organizer#12345", "Olivia Organizer", Roles.Organizer),
        new("participant@raceday.local", "Participant#12345", "Thandi Mokoena", Roles.Participant, new DateOnly(1990, 5, 17), Gender.Female),
        new("runner@raceday.local", "Runner#12345", "Jan van der Merwe", Roles.Participant, new DateOnly(1985, 3, 2), Gender.Male),
        // a participant without a profile: age and gender categories refuse them until they complete it
        new("newcomer@raceday.local", "Newcomer#12345", "Nina Newcomer", Roles.Participant),
        // a deactivated account: signing in is refused
        new("inactive@raceday.local", "Inactive#12345", "Ivan Inactive", Roles.Participant, IsActive: false),
    ];

    public static void Seed(RaceDayDbContext db, IConfiguration configuration, ILogger logger, bool isDevelopment)
    {
        SeedVenue(db);
        SeedAdmin(db, configuration);

        if (configuration.GetValue("Seed:DemoUsers", false))
        {
            if (!isDevelopment)
                logger.LogWarning("Seed:DemoUsers is enabled outside Development: these accounts have public passwords.");
            SeedDemoUsers(db);
        }
    }

    private static void SeedVenue(RaceDayDbContext db)
    {
        if (db.Venues.Any()) return;

        db.Venues.Add(new Venue
        {
            Name = "Cape Town Stadium",
            Location = "Fritz Sonnenberg Rd, Green Point, Cape Town",
            Capacity = 55000
        });
        db.SaveChanges();
    }

    /// <summary>Optional admin, only created when Seed:AdminEmail and Seed:AdminPassword are configured.</summary>
    private static void SeedAdmin(RaceDayDbContext db, IConfiguration configuration)
    {
        var email = configuration["Seed:AdminEmail"]?.Trim().ToLowerInvariant();
        var password = configuration["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;

        AddIfMissing(db, new DemoUser(email, password, "Administrator", Roles.Admin));
        db.SaveChanges();
    }

    private static void SeedDemoUsers(RaceDayDbContext db)
    {
        foreach (var user in DemoUsers) AddIfMissing(db, user);
        db.SaveChanges();
    }

    /// <summary>Idempotent: an existing account (and its password) is never touched.</summary>
    private static void AddIfMissing(RaceDayDbContext db, DemoUser demo)
    {
        if (db.Users.Any(u => u.Email == demo.Email)) return;

        db.Users.Add(new User
        {
            FullName = demo.FullName,
            Email = demo.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(demo.Password),
            Role = demo.Role,
            DateOfBirth = demo.DateOfBirth,
            Gender = demo.Gender,
            IsActive = demo.IsActive
        });
    }
}
