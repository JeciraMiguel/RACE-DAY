using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using RaceDayApi.Contracts;
using RaceDayApi.Server.Models;

public class RaceDayAuthTests : IClassFixture<RaceDayFactory>
{
    private const string Password = "Password123!";

    private readonly RaceDayFactory _factory;

    public RaceDayAuthTests(RaceDayFactory factory) => _factory = factory;

    private HttpClient Client() => _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    private static HttpClient WithToken(HttpClient client, string token)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private async Task<string> RegisterAsync(string email, string password = Password)
    {
        (await Client().PostAsJsonAsync("/api/auth/register", new RegisterDto("User " + email, email, password)))
            .StatusCode.Should().Be(HttpStatusCode.Created);
        return email;
    }

    private async Task<AuthResponseDto> LoginAsync(string email, string password = Password)
    {
        var response = await Client().PostAsJsonAsync("/api/auth/login", new LoginDto(email, password));
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!;
    }

    private async Task<HttpClient> AdminAsync() =>
        WithToken(Client(), (await LoginAsync(RaceDayFactory.AdminEmail, RaceDayFactory.AdminPassword)).Token);

    private async Task<int> UserIdAsync(HttpClient admin, string email) =>
        (await admin.GetFromJsonAsync<PagedResult<UserSummaryDto>>($"/api/users?search={email}"))!
            .Items.Single(u => u.Email == email).UserId;

    [Fact]
    public async Task DemoUsers_AreNotSeededUnlessEnabled()
    {
        // appsettings.Development.json enables them; the test host turns them off like any other environment
        var response = await Client().PostAsJsonAsync("/api/auth/login", new LoginDto("organizer@raceday.local", "Organizer#12345"));
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ---------- sessions ----------

    [Fact]
    public async Task Login_IssuesShortLivedAccessToken_AndRefreshToken()
    {
        await RegisterAsync("session@raceday.test");
        var session = await LoginAsync("session@raceday.test");

        session.RefreshToken.Should().NotBeNullOrEmpty();
        session.ExpiresAt.Should().BeAfter(DateTime.UtcNow).And.BeBefore(DateTime.UtcNow.AddMinutes(20));
    }

    [Fact]
    public async Task Refresh_RotatesTokens_AndDetectsReuse()
    {
        await RegisterAsync("rotate@raceday.test");
        var first = await LoginAsync("rotate@raceday.test");

        var refreshed = await Client().PostAsJsonAsync("/api/auth/refresh", new RefreshRequestDto(first.RefreshToken));
        refreshed.StatusCode.Should().Be(HttpStatusCode.OK);
        var second = (await refreshed.Content.ReadFromJsonAsync<AuthResponseDto>())!;
        second.RefreshToken.Should().NotBe(first.RefreshToken);

        // the new access token works
        (await WithToken(Client(), second.Token).GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.OK);

        // replaying the already-used token is rejected and revokes the whole family
        (await Client().PostAsJsonAsync("/api/auth/refresh", new RefreshRequestDto(first.RefreshToken)))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client().PostAsJsonAsync("/api/auth/refresh", new RefreshRequestDto(second.RefreshToken)))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        (await Client().PostAsJsonAsync("/api/auth/refresh", new RefreshRequestDto("garbage")))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Logout_RevokesTheRefreshToken()
    {
        await RegisterAsync("logout@raceday.test");
        var session = await LoginAsync("logout@raceday.test");

        (await Client().PostAsJsonAsync("/api/auth/logout", new RefreshRequestDto(session.RefreshToken)))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await Client().PostAsJsonAsync("/api/auth/refresh", new RefreshRequestDto(session.RefreshToken)))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // unknown tokens do not leak anything
        (await Client().PostAsJsonAsync("/api/auth/logout", new RefreshRequestDto("unknown")))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    // ---------- credentials ----------

    [Theory]
    [InlineData("onlyletters")]
    [InlineData("12345678")]
    [InlineData("a1")]
    public async Task Register_EnforcesPasswordPolicy(string password)
    {
        var response = await Client().PostAsJsonAsync("/api/auth/register",
            new RegisterDto("Weak", $"weak-{Guid.NewGuid():N}@raceday.test", password));
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Login_FailuresAreGeneric_AndAccountLocksAfterRepeatedFailures()
    {
        await RegisterAsync("lock@raceday.test");

        var unknown = await Client().PostAsJsonAsync("/api/auth/login", new LoginDto("nobody@raceday.test", Password));
        var wrong = await Client().PostAsJsonAsync("/api/auth/login", new LoginDto("lock@raceday.test", "Wrong-password-1"));
        unknown.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        wrong.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await unknown.Content.ReadAsStringAsync()).Should().Be(await wrong.Content.ReadAsStringAsync());

        for (int i = 0; i < 4; i++)
            await Client().PostAsJsonAsync("/api/auth/login", new LoginDto("lock@raceday.test", "Wrong-password-1"));

        // now locked: even the right password is refused
        (await Client().PostAsJsonAsync("/api/auth/login", new LoginDto("lock@raceday.test", Password)))
            .StatusCode.Should().Be((HttpStatusCode)423);
    }

    [Fact]
    public async Task SuccessfulLogin_ResetsTheFailureCounter()
    {
        await RegisterAsync("reset@raceday.test");
        for (int i = 0; i < 3; i++)
            await Client().PostAsJsonAsync("/api/auth/login", new LoginDto("reset@raceday.test", "Wrong-password-1"));
        await LoginAsync("reset@raceday.test");

        // 3 more failures would exceed the limit of 5 only if the counter had not been reset
        for (int i = 0; i < 3; i++)
            await Client().PostAsJsonAsync("/api/auth/login", new LoginDto("reset@raceday.test", "Wrong-password-1"));
        await LoginAsync("reset@raceday.test");
    }

    // ---------- profile ----------

    [Fact]
    public async Task Profile_CanBeReadAndUpdated()
    {
        await RegisterAsync("profile@raceday.test");
        var client = WithToken(Client(), (await LoginAsync("profile@raceday.test")).Token);

        var me = await client.GetFromJsonAsync<ProfileDto>("/api/auth/me");
        me!.Email.Should().Be("profile@raceday.test");
        me.Role.Should().Be("Participant");

        var update = new UpdateProfileDto("New Name", new DateOnly(1990, 5, 17), Gender.Female, "+27 82 000 0000", "Contact", "+27 83 000 0000");
        var response = await client.PutAsJsonAsync("/api/auth/me", update);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var updated = await client.GetFromJsonAsync<ProfileDto>("/api/auth/me");
        updated!.FullName.Should().Be("New Name");
        updated.DateOfBirth.Should().Be(new DateOnly(1990, 5, 17));
        updated.Gender.Should().Be(Gender.Female);
        updated.EmergencyContactName.Should().Be("Contact");

        (await client.PutAsJsonAsync("/api/auth/me", update with { DateOfBirth = new DateOnly(2999, 1, 1) }))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await Client().GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ChangePassword_ValidatesInput_AndSignsTheUserOutEverywhere()
    {
        await RegisterAsync("change@raceday.test");
        var session = await LoginAsync("change@raceday.test");
        var client = WithToken(Client(), session.Token);

        (await client.PostAsJsonAsync("/api/auth/change-password", new ChangePasswordDto("Wrong-current-1", "NewPassword456")))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await client.PostAsJsonAsync("/api/auth/change-password", new ChangePasswordDto(Password, "weakpassword")))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await client.PostAsJsonAsync("/api/auth/change-password", new ChangePasswordDto(Password, Password)))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await client.PostAsJsonAsync("/api/auth/change-password", new ChangePasswordDto(Password, "NewPassword456")))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);

        // old access token and refresh token no longer work
        (await client.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client().PostAsJsonAsync("/api/auth/refresh", new RefreshRequestDto(session.RefreshToken)))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // old password rejected, new one accepted
        (await Client().PostAsJsonAsync("/api/auth/login", new LoginDto("change@raceday.test", Password)))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        await LoginAsync("change@raceday.test", "NewPassword456");
    }

    // ---------- user administration ----------

    [Fact]
    public async Task Users_AreAdminOnly()
    {
        await RegisterAsync("plain@raceday.test");
        var participant = WithToken(Client(), (await LoginAsync("plain@raceday.test")).Token);

        (await participant.GetAsync("/api/users")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await participant.PutAsJsonAsync("/api/users/1/role", new UpdateRoleDto("Admin"))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await Client().GetAsync("/api/users")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Admin_CanListAndSearchUsers()
    {
        var token = Guid.NewGuid().ToString("N")[..8];
        await RegisterAsync($"find-{token}-a@raceday.test");
        await RegisterAsync($"find-{token}-b@raceday.test");
        var admin = await AdminAsync();

        var found = await admin.GetFromJsonAsync<PagedResult<UserSummaryDto>>($"/api/users?search={token}&pageSize=1");
        found!.TotalCount.Should().Be(2);
        found.Items.Should().HaveCount(1);

        (await admin.GetFromJsonAsync<PagedResult<UserSummaryDto>>($"/api/users?search={token}&role=Admin"))!
            .TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task RoleChange_TakesEffectImmediately()
    {
        var email = await RegisterAsync("promote@raceday.test");
        var session = await LoginAsync(email);
        var user = WithToken(Client(), session.Token);
        var admin = await AdminAsync();
        var id = await UserIdAsync(admin, email);

        // a participant cannot create events...
        var form = new MultipartFormDataContent
        {
            { new StringContent("T"), "Title" }, { new StringContent("2027-01-01T08:00:00"), "EventDate" }, { new StringContent("1"), "VenueId" }
        };
        (await user.PostAsync("/api/events", form)).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await admin.PutAsJsonAsync($"/api/users/{id}/role", new UpdateRoleDto("Bogus"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PutAsJsonAsync($"/api/users/{id}/role", new UpdateRoleDto(Roles.Organizer))).StatusCode.Should().Be(HttpStatusCode.NoContent);

        // ...the old token is invalidated, the refresh token revoked, a new login carries the new role
        (await user.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client().PostAsJsonAsync("/api/auth/refresh", new RefreshRequestDto(session.RefreshToken)))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await LoginAsync(email)).Role.Should().Be("Organizer");
    }

    [Fact]
    public async Task Admins_CannotChangeTheirOwnRoleOrStatus()
    {
        var admin = await AdminAsync();
        var adminId = await UserIdAsync(admin, RaceDayFactory.AdminEmail);

        (await admin.PutAsJsonAsync($"/api/users/{adminId}/role", new UpdateRoleDto("Participant"))).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await admin.PutAsJsonAsync($"/api/users/{adminId}/active", new UpdateActiveDto(false))).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await admin.PutAsJsonAsync("/api/users/999999/role", new UpdateRoleDto("Participant"))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Deactivation_SignsTheUserOutImmediately_AndCanBeReverted()
    {
        var email = await RegisterAsync("deactivate@raceday.test");
        var session = await LoginAsync(email);
        var user = WithToken(Client(), session.Token);
        var admin = await AdminAsync();
        var id = await UserIdAsync(admin, email);

        (await user.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await admin.PutAsJsonAsync($"/api/users/{id}/active", new UpdateActiveDto(false))).StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await user.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client().PostAsJsonAsync("/api/auth/refresh", new RefreshRequestDto(session.RefreshToken)))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client().PostAsJsonAsync("/api/auth/login", new LoginDto(email, Password)))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        (await admin.PutAsJsonAsync($"/api/users/{id}/active", new UpdateActiveDto(true))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        await LoginAsync(email);
    }
}

/// <summary>A factory with a very low auth rate limit to exercise throttling.</summary>
public class LowRateLimitFactory : RaceDayFactory
{
    protected override int AuthRateLimit => 3;
}

public class RaceDayRateLimitTests : IClassFixture<LowRateLimitFactory>
{
    private readonly LowRateLimitFactory _factory;

    public RaceDayRateLimitTests(LowRateLimitFactory factory) => _factory = factory;

    [Fact]
    public async Task AuthEndpoints_AreRateLimited_ButOtherEndpointsAreNot()
    {
        var client = _factory.CreateClient();
        var login = new LoginDto("nobody@raceday.test", "Password123!");

        for (int i = 0; i < 3; i++)
            (await client.PostAsJsonAsync("/api/auth/login", login)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var throttled = await client.PostAsJsonAsync("/api/auth/login", login);
        throttled.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        throttled.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");

        (await client.GetAsync("/api/events")).StatusCode.Should().Be(HttpStatusCode.OK);
    }
}

/// <summary>Allows a just-rotated refresh token to be replayed for 30 seconds.</summary>
public class RefreshLeewayFactory : RaceDayFactory
{
    protected override int RefreshReuseLeewaySeconds => 30;
}

public class RaceDayRefreshLeewayTests : IClassFixture<RefreshLeewayFactory>
{
    private const string Password = "Password123!";

    private readonly RefreshLeewayFactory _factory;

    public RaceDayRefreshLeewayTests(RefreshLeewayFactory factory) => _factory = factory;

    private HttpClient Client() => _factory.CreateClient();

    private async Task<AuthResponseDto> SignUpAndLoginAsync(string email)
    {
        (await Client().PostAsJsonAsync("/api/auth/register", new RegisterDto("Leeway " + email, email, Password))).StatusCode.Should().Be(HttpStatusCode.Created);
        var login = await Client().PostAsJsonAsync("/api/auth/login", new LoginDto(email, Password));
        return (await login.Content.ReadFromJsonAsync<AuthResponseDto>())!;
    }

    private Task<HttpResponseMessage> RefreshAsync(string token) => Client().PostAsJsonAsync("/api/auth/refresh", new RefreshRequestDto(token));

    [Fact]
    public async Task ReplayingAJustRotatedToken_Succeeds_BecausePagesCanReloadMidRefresh()
    {
        var session = await SignUpAndLoginAsync("leeway-ok@raceday.test");

        // the server rotates the token, but the browser never stores the answer (page reloaded)...
        (await RefreshAsync(session.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.OK);

        // ...so the next load presents the same token again
        var replay = await RefreshAsync(session.RefreshToken);
        replay.StatusCode.Should().Be(HttpStatusCode.OK);
        var again = (await replay.Content.ReadFromJsonAsync<AuthResponseDto>())!;
        again.RefreshToken.Should().NotBe(session.RefreshToken);

        (await Client().SendAsync(new HttpRequestMessage(HttpMethod.Get, "/api/auth/me") { Headers = { Authorization = new AuthenticationHeaderValue("Bearer", again.Token) } }))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        (await RefreshAsync(again.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ReplayingARotatedTokenAfterTheLeeway_IsTreatedAsTheft()
    {
        var session = await SignUpAndLoginAsync("leeway-late@raceday.test");
        var rotated = (await (await RefreshAsync(session.RefreshToken)).Content.ReadFromJsonAsync<AuthResponseDto>())!;

        // pretend the rotation happened a minute ago
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<RaceDayApi.Server.Data.RaceDayDbContext>();
            foreach (var token in db.RefreshTokens.Where(t => t.RotatedAt != null)) token.RotatedAt = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        (await RefreshAsync(session.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        // and the whole family is revoked, including the newest token
        (await RefreshAsync(rotated.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ATokenRevokedByLogout_CanNeverBeReplayed_EvenWithinTheLeeway()
    {
        var session = await SignUpAndLoginAsync("leeway-logout@raceday.test");

        (await Client().PostAsJsonAsync("/api/auth/logout", new RefreshRequestDto(session.RefreshToken))).StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await RefreshAsync(session.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
