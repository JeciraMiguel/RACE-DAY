using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using RaceDayApi.Server.Controllers;
using RaceDayApi.Server.Data;
using RaceDayApi.Server.Models;
using RaceDayApi.Contracts;

public class RaceDayUnitTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    public RaceDayUnitTests() => _connection.Open();

    public void Dispose() => _connection.Dispose();

    private RaceDayDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<RaceDayDbContext>().UseSqlite(_connection).Options;
        var context = new RaceDayDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    private static IConfiguration Config() => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "unit-test-signing-key-0123456789-abcdef",
            ["Jwt:Issuer"] = "RaceDayApi",
            ["Jwt:Audience"] = "RaceDayUsers"
        }).Build();

    [Fact]
    public async Task Register_CreatesParticipant_AndIgnoresPrivilegedRoles()
    {
        using var context = CreateContext();
        var controller = new AuthController(context, new RaceDayApi.Server.Services.TokenService(Config(), context), Config());

        var result = await controller.Register(new RegisterDto("Maria Silva", "Maria@RaceDay.com", "Password123!"));

        result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(201);
        var user = await context.Users.SingleAsync();
        user.Email.Should().Be("maria@raceday.com");
        user.Role.Should().Be(Roles.Participant);
        user.PasswordHash.Should().NotBe("Password123!");
    }

    [Fact]
    public async Task Register_RejectsDuplicateEmail()
    {
        using var context = CreateContext();
        var controller = new AuthController(context, new RaceDayApi.Server.Services.TokenService(Config(), context), Config());
        await controller.Register(new RegisterDto("A", "a@raceday.com", "Password123!"));

        var result = await controller.Register(new RegisterDto("B", "A@raceday.com", "Password123!"));

        result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(400);
    }

    [Fact]
    public async Task Login_ReturnsToken_ForValidCredentials_AndUnauthorizedOtherwise()
    {
        using var context = CreateContext();
        var controller = new AuthController(context, new RaceDayApi.Server.Services.TokenService(Config(), context), Config());
        await controller.Register(new RegisterDto("Maria", "maria@raceday.com", "Password123!"));

        var ok = await controller.Login(new LoginDto("maria@raceday.com", "Password123!"));
        var session = ok.Result.Should().BeOfType<OkObjectResult>()
            .Which.Value.Should().BeOfType<AuthResponseDto>().Subject;
        session.Token.Should().NotBeNullOrEmpty();
        session.RefreshToken.Should().NotBeNullOrEmpty();
        session.ExpiresAt.Should().BeAfter(DateTime.UtcNow);
        (await context.RefreshTokens.CountAsync()).Should().Be(1);
        (await context.RefreshTokens.SingleAsync()).TokenHash.Should().NotBe(session.RefreshToken); // only the hash is stored

        var bad = await controller.Login(new LoginDto("maria@raceday.com", "wrong-password"));
        bad.Result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(401);
    }

    [Fact]
    public async Task CreateCategory_ReturnsBadRequest_WhenEventDoesNotExist()
    {
        using var context = CreateContext();
        var controller = new CategoriesController(context);

        var result = await controller.CreateCategory(new CreateCategoryDto("Senior 10km", 150.00m, 999));

        result.Result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(400);
    }

    [Fact]
    public async Task RaceNumbers_AreUniquePerEvent_AtDatabaseLevel()
    {
        using var context = CreateContext();
        var venue = new Venue { Name = "V", Location = "L", Capacity = 10 };
        var ev = new Event { Title = "E", EventDate = DateTime.UtcNow.AddDays(10), Venue = venue };
        var category = new Category { Name = "C", Event = ev };
        var u1 = new User { FullName = "A", Email = "a@x.com", PasswordHash = "h" };
        var u2 = new User { FullName = "B", Email = "b@x.com", PasswordHash = "h" };
        context.AddRange(venue, ev, category, u1, u2);
        await context.SaveChangesAsync();

        context.Registrations.Add(new Registration { User = u1, Category = category, EventId = ev.EventId, RaceNumber = 1 });
        await context.SaveChangesAsync();

        context.Registrations.Add(new Registration { User = u2, Category = category, EventId = ev.EventId, RaceNumber = 1 });
        var act = () => context.SaveChangesAsync();

        await act.Should().ThrowAsync<DbUpdateException>();
    }

    [Theory]
    [InlineData(ResultStatus.Finished, 1)]
    [InlineData(ResultStatus.DNF, null)]
    public async Task Ranking_OnlyRanksFinishedResults_AndSharesRanksOnTies(ResultStatus status, int? expectedRank)
    {
        using var context = CreateContext();
        var venue = new Venue { Name = "V", Location = "L", Capacity = 10 };
        var ev = new Event { Title = "E", EventDate = DateTime.UtcNow.AddDays(10), Venue = venue };
        var category = new Category { Name = "C", Event = ev };
        var user = new User { FullName = "A", Email = "a@x.com", PasswordHash = "h" };
        context.AddRange(venue, ev, category, user);
        await context.SaveChangesAsync();

        var reg = new Registration { User = user, Category = category, EventId = ev.EventId, RaceNumber = 1 };
        var result = new TimingResult
        {
            Registration = reg,
            Status = status,
            FinishTime = status == ResultStatus.Finished ? TimeSpan.FromMinutes(30) : null,
            OverallRank = 99
        };
        context.AddRange(reg, result);
        await context.SaveChangesAsync();

        await new RaceDayApi.Server.Services.RankingService(context).RecalculateAsync(category.CategoryId);
        await context.SaveChangesAsync();

        (await context.TimingResults.SingleAsync()).OverallRank.Should().Be(expectedRank);
    }
}
