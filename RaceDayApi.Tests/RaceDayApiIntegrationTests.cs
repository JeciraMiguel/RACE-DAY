using Microsoft.AspNetCore.Http;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using RaceDayApi.Server.Data;
using RaceDayApi.Server.Models;
using RaceDayApi.Contracts;
using RaceDayApi.Server.Services;

public class RaceDayFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    public const string AdminEmail = "admin@raceday.test";
    public const string AdminPassword = "Admin#12345";

    /// <summary>Per-minute limit on the auth endpoints; high by default so tests are not throttled.</summary>
    protected virtual int AuthRateLimit => 100_000;

    /// <summary>How long a just-rotated refresh token may be replayed; 0 keeps reuse detection strict for most tests.</summary>
    protected virtual int RefreshReuseLeewaySeconds => 0;

    /// <summary>The demo users are enabled in appsettings.Development.json; tests turn them off unless asked.</summary>
    protected virtual bool SeedDemoUsers => false;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        _connection.Open();
        builder.UseSetting("RateLimit:AuthPerMinute", AuthRateLimit.ToString());
        builder.UseSetting("Jwt:RefreshReuseLeewaySeconds", RefreshReuseLeewaySeconds.ToString());
        builder.UseSetting("Seed:DemoUsers", SeedDemoUsers ? "true" : "false");
        builder.UseEnvironment("Development");
        builder.UseSetting("Jwt:Key", "integration-test-signing-key-0123456789");
        builder.UseSetting("Seed:AdminEmail", AdminEmail);
        builder.UseSetting("Seed:AdminPassword", AdminPassword);

        ConfigureHost(builder);

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<RaceDayDbContext>>();
            services.AddDbContext<RaceDayDbContext>(o => ConfigureDatabase(o));

            services.RemoveAll<IBlobService>();
            services.AddSingleton<IBlobService, FakeBlobService>();
        });
    }

    /// <summary>Extension point for factories that need extra host settings (e.g. a web root).</summary>
    protected virtual void ConfigureHost(IWebHostBuilder builder) { }

    /// <summary>In-memory SQLite on one shared connection by default.</summary>
    protected virtual void ConfigureDatabase(DbContextOptionsBuilder options) => options.UseSqlite(_connection);

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) _connection.Dispose();
    }

    private class FakeBlobService : IBlobService
    {
        public Task<string> UploadFileAsync(IFormFile file, string containerName) =>
            Task.FromResult($"https://blob.test/{containerName}/{file.FileName}");

        public Task DeleteFileAsync(string fileUrl, string containerName) => Task.CompletedTask;
    }
}

internal static class HttpClientExtensions
{
    public static Task<HttpResponseMessage> PatchAsJsonAsync<T>(this HttpClient client, string uri, T value) =>
        client.PatchAsync(uri, JsonContent.Create(value));
}

internal static class ServiceCollectionExtensions
{
    public static void RemoveAll<T>(this IServiceCollection services)
    {
        foreach (var d in services.Where(d => d.ServiceType == typeof(T)).ToList())
            services.Remove(d);
    }
}

public class RaceDayApiIntegrationTests : IClassFixture<RaceDayFactory>
{
    private readonly RaceDayFactory _factory;

    public RaceDayApiIntegrationTests(RaceDayFactory factory) => _factory = factory;

    // ---------- helpers ----------

    private HttpClient Client() => _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    private static async Task<HttpClient> LoginAsync(HttpClient client, string email, string password)
    {
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginDto(email, password));
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponseDto>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return client;
    }

    private async Task<HttpClient> AdminClientAsync() =>
        await LoginAsync(Client(), RaceDayFactory.AdminEmail, RaceDayFactory.AdminPassword);

    private async Task<HttpClient> ParticipantClientAsync(string email, string? fullName = null, DateOnly? dob = null, Gender? gender = null)
    {
        var client = Client();
        (await client.PostAsJsonAsync("/api/auth/register",
                new RegisterDto(fullName ?? "Runner " + email, email, "Password123!", dob, gender)))
            .StatusCode.Should().Be(HttpStatusCode.Created);
        return await LoginAsync(client, email, "Password123!");
    }

    private async Task<HttpClient> OrganizerClientAsync(string email)
    {
        var client = Client();
        (await client.PostAsJsonAsync("/api/auth/register", new RegisterDto("Organizer " + email, email, "Password123!")))
            .StatusCode.Should().Be(HttpStatusCode.Created);

        // Promote through the admin API (takes effect on the next login)
        var admin = await AdminClientAsync();
        var users = await admin.GetFromJsonAsync<PagedResult<UserSummaryDto>>($"/api/users?search={email}");
        var id = users!.Items.Single(u => u.Email == email).UserId;
        (await admin.PutAsJsonAsync($"/api/users/{id}/role", new UpdateRoleDto(Roles.Organizer)))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);

        return await LoginAsync(client, email, "Password123!");
    }

    private static MultipartFormDataContent EventForm(
        string title, string date = "2027-01-01T08:00:00", int venueId = 1, string? opens = null, string? closes = null)
    {
        var form = new MultipartFormDataContent
        {
            { new StringContent(title), "Title" },
            { new StringContent("Desc"), "Description" },
            { new StringContent(date), "EventDate" },
            { new StringContent(venueId.ToString()), "VenueId" }
        };
        if (opens != null) form.Add(new StringContent(opens), "RegistrationOpensAt");
        if (closes != null) form.Add(new StringContent(closes), "RegistrationClosesAt");
        return form;
    }

    private static async Task<EventResponseDto> CreateEventAsync(HttpClient client, string title, MultipartFormDataContent? form = null)
    {
        var response = await client.PostAsync("/api/events", form ?? EventForm(title));
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<EventResponseDto>())!;
    }

    private static async Task<CategoryResponseDto> AddCategoryAsync(HttpClient client, CreateCategoryDto dto)
    {
        var response = await client.PostAsJsonAsync("/api/categories", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<CategoryResponseDto>())!;
    }

    private static async Task PublishAsync(HttpClient client, int eventId) =>
        (await client.PostAsync($"/api/events/{eventId}/publish", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

    private static async Task<(EventResponseDto Event, CategoryResponseDto Category)> PublishedEventAsync(
        HttpClient owner, string title, Func<int, CreateCategoryDto>? category = null, MultipartFormDataContent? form = null)
    {
        var ev = await CreateEventAsync(owner, title, form);
        var cat = await AddCategoryAsync(owner, category?.Invoke(ev.EventId) ?? new CreateCategoryDto("10km", 100m, ev.EventId));
        await PublishAsync(owner, ev.EventId);
        return (ev, cat);
    }

    private static async Task<RegistrationResponseDto> RegisterForAsync(HttpClient runner, int categoryId)
    {
        var r = await runner.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(categoryId));
        r.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await r.Content.ReadFromJsonAsync<RegistrationResponseDto>())!;
    }

    private static async Task<string> ErrorOf(HttpResponseMessage response) =>
        (await response.Content.ReadAsStringAsync());

    // ---------- basics ----------

    [Fact]
    public async Task Health_IsAvailable()
    {
        var response = await Client().GetAsync("/health");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Swagger_DeclaresTheBearerScheme()
    {
        var json = await Client().GetStringAsync("/swagger/v1/swagger.json");
        json.Should().Contain("\"Bearer\"").And.Contain("\"scheme\": \"bearer\"");
    }

    [Fact]
    public async Task Errors_UseProblemDetails()
    {
        var anon = Client();

        var notFound = await anon.GetAsync("/api/events/999999");
        notFound.StatusCode.Should().Be(HttpStatusCode.NotFound);
        notFound.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        var problem = await notFound.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        problem.GetProperty("status").GetInt32().Should().Be(404);
        problem.GetProperty("detail").GetString().Should().Contain("999999");

        // bare 401 (no body from the auth middleware) is turned into ProblemDetails too
        var unauthorized = await anon.GetAsync("/api/registrations");
        unauthorized.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        unauthorized.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");

        // model validation keeps the standard validation shape
        var invalid = await anon.PostAsJsonAsync("/api/auth/register", new { fullName = "", email = "nope", password = "x" });
        invalid.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await invalid.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("errors").ValueKind
            .Should().Be(System.Text.Json.JsonValueKind.Object);
    }

    [Fact]
    public async Task Events_ArePublicToRead_ButWritesRequireAuthorization()
    {
        var anon = Client();
        (await anon.GetAsync("/api/events")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await anon.PostAsync("/api/events", EventForm("X"))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var participant = await ParticipantClientAsync("p-auth@raceday.test");
        (await participant.PostAsync("/api/events", EventForm("X"))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Register_CannotEscalateToAdmin()
    {
        var client = Client();
        var response = await client.PostAsJsonAsync("/api/auth/register",
            new { fullName = "Mallory", email = "mallory@raceday.test", password = "Password123!", role = "Admin" });
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginDto("mallory@raceday.test", "Password123!"));
        (await login.Content.ReadFromJsonAsync<AuthResponseDto>())!.Role.Should().Be("Participant");
    }

    [Fact]
    public async Task Registrations_RequireAuthentication()
    {
        (await Client().GetAsync("/api/registrations")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ---------- venues ----------

    [Fact]
    public async Task Venues_CrudWithGuards()
    {
        var admin = await AdminClientAsync();
        var anon = Client();

        (await anon.PostAsJsonAsync("/api/venues", new SaveVenueDto("Nope", "Nowhere", 10))).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized);

        var created = await admin.PostAsJsonAsync("/api/venues", new SaveVenueDto("Table Mountain Park", "Cape Town", 500, "Cape Town", "Trail start"));
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var venue = (await created.Content.ReadFromJsonAsync<VenueDto>())!;

        (await anon.GetFromJsonAsync<List<VenueDto>>("/api/venues"))!.Should().Contain(v => v.VenueId == venue.VenueId);

        (await admin.PutAsJsonAsync($"/api/venues/{venue.VenueId}", new SaveVenueDto("Renamed Park", "Cape Town", 600)))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await anon.GetFromJsonAsync<VenueDto>($"/api/venues/{venue.VenueId}"))!.Name.Should().Be("Renamed Park");

        // a venue in use cannot be deleted
        await CreateEventAsync(admin, "Venue user", EventForm("Venue user", venueId: venue.VenueId));
        (await admin.DeleteAsync($"/api/venues/{venue.VenueId}")).StatusCode.Should().Be(HttpStatusCode.Conflict);

        var spare = await (await admin.PostAsJsonAsync("/api/venues", new SaveVenueDto("Spare", "Somewhere", 5)))
            .Content.ReadFromJsonAsync<VenueDto>();
        (await admin.DeleteAsync($"/api/venues/{spare!.VenueId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.DeleteAsync("/api/venues/9999")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Venues_StoreAnIanaTimeZone_AndRejectInvalidOnes()
    {
        var admin = await AdminClientAsync();

        var created = await admin.PostAsJsonAsync("/api/venues", new SaveVenueDto("Zoned venue", "Somewhere", 100, TimeZone: "Africa/Johannesburg"));
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var venue = (await created.Content.ReadFromJsonAsync<VenueDto>())!;
        venue.TimeZone.Should().Be("Africa/Johannesburg");

        (await admin.PostAsJsonAsync("/api/venues", new SaveVenueDto("Bad zone", "Somewhere", 100, TimeZone: "Mars/Olympus")))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PutAsJsonAsync($"/api/venues/{venue.VenueId}", new SaveVenueDto("Zoned venue", "Somewhere", 100, TimeZone: "Nope")))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // blank clears it
        (await admin.PutAsJsonAsync($"/api/venues/{venue.VenueId}", new SaveVenueDto("Zoned venue", "Somewhere", 100, TimeZone: " ")))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await Client().GetFromJsonAsync<VenueDto>($"/api/venues/{venue.VenueId}"))!.TimeZone.Should().BeNull();
    }

    // ---------- events: lifecycle, visibility, filters ----------

    [Fact]
    public async Task Admin_CanCreateEvent_WithImage_AndReadItBack()
    {
        var admin = await AdminClientAsync();
        var form = EventForm("City 10K");
        var image = new ByteArrayContent([1, 2, 3]);
        image.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(image, "imageFile", "banner.png");

        var created = await admin.PostAsync("/api/events", form);
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await created.Content.ReadFromJsonAsync<EventResponseDto>();
        dto!.ImageUrl.Should().Be("https://blob.test/event-banners/banner.png");
        dto.Status.Should().Be(EventStatus.Draft);

        var fetched = await admin.GetFromJsonAsync<EventDetailDto>($"/api/events/{dto.EventId}");
        fetched!.Title.Should().Be("City 10K");
        fetched.VenueName.Should().Be("Cape Town Stadium");
        fetched.OrganizerId.Should().NotBeNull();
    }

    [Fact]
    public async Task Description_IsOptional_WhenCreatingAndUpdatingEvents()
    {
        var admin = await AdminClientAsync();

        // no Description field at all, and an explicitly empty one (what the web form sends)
        var without = new MultipartFormDataContent
        {
            { new StringContent("No description"), "Title" },
            { new StringContent("2099-01-01T08:00:00"), "EventDate" },
            { new StringContent("1"), "VenueId" },
        };
        var created = await admin.PostAsync("/api/events", without);
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var ev = (await created.Content.ReadFromJsonAsync<EventResponseDto>())!;
        ev.Description.Should().BeEmpty();

        static MultipartFormDataContent WithBlankDescription(string title) => new()
        {
            { new StringContent(title), "Title" },
            { new StringContent(""), "Description" },
            { new StringContent("2099-01-01T08:00:00"), "EventDate" },
            { new StringContent("1"), "VenueId" },
        };
        (await admin.PostAsync("/api/events", WithBlankDescription("Blank description"))).StatusCode.Should().Be(HttpStatusCode.Created);

        (await admin.PutAsync($"/api/events/{ev.EventId}", WithBlankDescription("No description updated"))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.GetFromJsonAsync<EventDetailDto>($"/api/events/{ev.EventId}"))!.Description.Should().BeEmpty();
    }

    [Fact]
    public async Task CreateEvent_RejectsNonImageUploads_UnknownVenue_AndBadWindow()
    {
        var admin = await AdminClientAsync();

        var form = EventForm("Bad file");
        var file = new ByteArrayContent([1]);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/x-msdownload");
        form.Add(file, "imageFile", "evil.exe");
        (await admin.PostAsync("/api/events", form)).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await admin.PostAsync("/api/events", EventForm("T", venueId: 999))).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await admin.PostAsync("/api/events", EventForm("T", opens: "2026-12-01T00:00:00", closes: "2026-11-01T00:00:00")))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PostAsync("/api/events", EventForm("T", closes: "2027-02-01T00:00:00")))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task DraftEvents_AreHiddenFromThePublic_UntilPublished()
    {
        var admin = await AdminClientAsync();
        var anon = Client();
        var ev = await CreateEventAsync(admin, "Draft visibility event");

        (await anon.GetAsync($"/api/events/{ev.EventId}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await anon.GetFromJsonAsync<PagedResult<EventResponseDto>>("/api/events?search=Draft visibility"))!
            .TotalCount.Should().Be(0);
        (await admin.GetFromJsonAsync<PagedResult<EventResponseDto>>("/api/events?search=Draft visibility"))!
            .TotalCount.Should().Be(1);

        await AddCategoryAsync(admin, new CreateCategoryDto("5km", 50m, ev.EventId));
        await PublishAsync(admin, ev.EventId);

        (await anon.GetFromJsonAsync<EventDetailDto>($"/api/events/{ev.EventId}"))!.Status.Should().Be(EventStatus.Published);
    }

    [Fact]
    public async Task Publish_RequiresCategory_FutureDate_AndOnlyFromDraft()
    {
        var admin = await AdminClientAsync();

        var empty = await CreateEventAsync(admin, "No categories");
        (await admin.PostAsync($"/api/events/{empty.EventId}/publish", null)).StatusCode.Should().Be(HttpStatusCode.Conflict);

        var past = await CreateEventAsync(admin, "Past event", EventForm("Past event", date: "2020-01-01T08:00:00"));
        await AddCategoryAsync(admin, new CreateCategoryDto("5km", 50m, past.EventId));
        (await admin.PostAsync($"/api/events/{past.EventId}/publish", null)).StatusCode.Should().Be(HttpStatusCode.Conflict);

        var (ev, _) = await PublishedEventAsync(admin, "Lifecycle event");
        (await admin.PostAsync($"/api/events/{ev.EventId}/publish", null)).StatusCode.Should().Be(HttpStatusCode.Conflict);

        (await admin.PostAsync($"/api/events/{ev.EventId}/cancel", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.GetFromJsonAsync<EventDetailDto>($"/api/events/{ev.EventId}"))!.Status.Should().Be(EventStatus.Cancelled);
        (await admin.PostAsync($"/api/events/{ev.EventId}/complete", null)).StatusCode.Should().Be(HttpStatusCode.Conflict);

        // cancelled events can no longer be edited or receive categories
        (await admin.PutAsync($"/api/events/{ev.EventId}", EventForm("Edited"))).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await admin.PostAsJsonAsync("/api/categories", new CreateCategoryDto("x", 1m, ev.EventId))).StatusCode
            .Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Events_SupportSearchStatusDateFiltersAndPaging()
    {
        var admin = await AdminClientAsync();
        var token = "Zeta" + Guid.NewGuid().ToString("N")[..6];
        foreach (var (title, date) in new[] { ($"{token} A", "2027-03-01T08:00:00"), ($"{token} B", "2027-04-01T08:00:00"), ($"{token} C", "2027-05-01T08:00:00") })
            await PublishedEventAsync(admin, title, form: EventForm(title, date));

        var all = await admin.GetFromJsonAsync<PagedResult<EventResponseDto>>($"/api/events?search={token}");
        all!.TotalCount.Should().Be(3);
        all.Items.Select(e => e.Title).Should().Equal($"{token} A", $"{token} B", $"{token} C");

        var page2 = await admin.GetFromJsonAsync<PagedResult<EventResponseDto>>($"/api/events?search={token}&pageSize=2&page=2");
        page2!.Items.Should().ContainSingle().Which.Title.Should().Be($"{token} C");
        page2.TotalCount.Should().Be(3);

        var ranged = await admin.GetFromJsonAsync<PagedResult<EventResponseDto>>(
            $"/api/events?search={token}&from=2027-03-15T00:00:00&to=2027-04-15T00:00:00");
        ranged!.Items.Should().ContainSingle().Which.Title.Should().Be($"{token} B");

        (await admin.GetFromJsonAsync<PagedResult<EventResponseDto>>($"/api/events?search={token}&status=Cancelled"))!
            .TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task EventList_IncludesCardAggregates_AndSupportsNewestFirst()
    {
        var admin = await AdminClientAsync();
        var token = "Agg" + Guid.NewGuid().ToString("N")[..6];

        // two limited categories (10 + 5 spots), cheapest fee 50, one registration
        var ev = await CreateEventAsync(admin, $"{token} old", EventForm($"{token} old", date: "2027-02-01T08:00:00"));
        var big = await AddCategoryAsync(admin, new CreateCategoryDto("10km", 100m, ev.EventId, MaxParticipants: 10));
        await AddCategoryAsync(admin, new CreateCategoryDto("5km", 50m, ev.EventId, MaxParticipants: 5));
        await PublishAsync(admin, ev.EventId);
        await RegisterForAsync(await ParticipantClientAsync($"{token}@raceday.test"), big.CategoryId);

        // an unlimited category and a venue capacity of 3 -> the venue is the limit
        var venue = await (await admin.PostAsJsonAsync("/api/venues", new SaveVenueDto($"{token} venue", "Nowhere", 3)))
            .Content.ReadFromJsonAsync<VenueDto>();
        var (_, _) = await PublishedEventAsync(admin, $"{token} new",
            form: EventForm($"{token} new", date: "2027-09-01T08:00:00", venueId: venue!.VenueId));

        var asc = await Client().GetFromJsonAsync<PagedResult<EventResponseDto>>($"/api/events?search={token}");
        asc!.Items.Select(e => e.Title).Should().Equal($"{token} old", $"{token} new");

        var card = asc.Items[0];
        card.CategoryCount.Should().Be(2);
        card.MinEntryFee.Should().Be(50m);
        card.SpotsLeft.Should().Be(14);

        asc.Items[1].SpotsLeft.Should().Be(3);

        var desc = await Client().GetFromJsonAsync<PagedResult<EventResponseDto>>($"/api/events?search={token}&newestFirst=true");
        desc!.Items.Select(e => e.Title).Should().Equal($"{token} new", $"{token} old");
    }

    [Fact]
    public async Task EventList_MineFilter_ShowsOnlyTheCallersEvents_WithRegistrationCounts()
    {
        var owner = await OrganizerClientAsync("mine-owner@raceday.test");
        var other = await OrganizerClientAsync("mine-other@raceday.test");
        var token = "Mine" + Guid.NewGuid().ToString("N")[..6];

        var (ownEvent, cat) = await PublishedEventAsync(owner, $"{token} own");
        await CreateEventAsync(owner, $"{token} own draft");
        await PublishedEventAsync(other, $"{token} other");
        await RegisterForAsync(await ParticipantClientAsync($"{token}-a@raceday.test"), cat.CategoryId);
        await RegisterForAsync(await ParticipantClientAsync($"{token}-b@raceday.test"), cat.CategoryId);

        var everything = await owner.GetFromJsonAsync<PagedResult<EventResponseDto>>($"/api/events?search={token}");
        everything!.Items.Select(e => e.Title).Should().Contain($"{token} other"); // published events are public

        var mine = await owner.GetFromJsonAsync<PagedResult<EventResponseDto>>($"/api/events?search={token}&mine=true");
        mine!.Items.Select(e => e.Title).Should().BeEquivalentTo([$"{token} own", $"{token} own draft"]);
        mine.Items.Single(e => e.EventId == ownEvent.EventId).RegisteredCount.Should().Be(2);

        // anonymous callers own nothing
        (await Client().GetFromJsonAsync<PagedResult<EventResponseDto>>($"/api/events?search={token}&mine=true"))!
            .TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task EventList_ReportsNoLimit_WhenACategoryIsUnlimitedAndTheVenueHasNoCap()
    {
        var admin = await AdminClientAsync();
        var token = "Unl" + Guid.NewGuid().ToString("N")[..6];
        var venue = await (await admin.PostAsJsonAsync("/api/venues", new SaveVenueDto($"{token} venue", "Nowhere", 0)))
            .Content.ReadFromJsonAsync<VenueDto>();
        await PublishedEventAsync(admin, $"{token} race", form: EventForm($"{token} race", venueId: venue!.VenueId));

        var list = await Client().GetFromJsonAsync<PagedResult<EventResponseDto>>($"/api/events?search={token}");
        list!.Items.Should().ContainSingle().Which.SpotsLeft.Should().BeNull();
    }

    [Fact]
    public async Task Registrations_AdminsNeedAllTrueToSeeEveryone()
    {
        var admin = await AdminClientAsync();
        var (_, cat) = await PublishedEventAsync(admin, "All registrations");
        var runner = await ParticipantClientAsync("allreg@raceday.test");
        await RegisterForAsync(runner, cat.CategoryId);

        (await admin.GetFromJsonAsync<List<RegistrationResponseDto>>("/api/registrations"))!.Should().BeEmpty();
        (await admin.GetFromJsonAsync<List<RegistrationResponseDto>>("/api/registrations?all=true"))!.Should().NotBeEmpty();

        // the flag is ignored for non-admins
        (await runner.GetFromJsonAsync<List<RegistrationResponseDto>>("/api/registrations?all=true"))!.Should().ContainSingle();
    }

    [Fact]
    public async Task EventDetail_IncludesCategoriesWithSpotsLeft()
    {
        var admin = await AdminClientAsync();
        var (ev, cat) = await PublishedEventAsync(admin, "Spots event",
            id => new CreateCategoryDto("Half", 200m, id, DistanceKm: 21.1m, MaxParticipants: 3));
        await RegisterForAsync(await ParticipantClientAsync("spots1@raceday.test"), cat.CategoryId);

        var detail = await Client().GetFromJsonAsync<EventDetailDto>($"/api/events/{ev.EventId}");
        var c = detail!.Categories.Should().ContainSingle().Subject;
        c.RegisteredCount.Should().Be(1);
        c.SpotsLeft.Should().Be(2);
        c.DistanceKm.Should().Be(21.1m);
    }

    [Fact]
    public async Task Organizers_CanOnlyManageTheirOwnEvents()
    {
        var owner = await OrganizerClientAsync("owner@raceday.test");
        var other = await OrganizerClientAsync("other@raceday.test");
        var admin = await AdminClientAsync();

        var (ev, cat) = await PublishedEventAsync(owner, "Owned event");

        (await other.PutAsync($"/api/events/{ev.EventId}", EventForm("Hijacked"))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await other.PostAsync($"/api/events/{ev.EventId}/cancel", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await other.PostAsJsonAsync("/api/categories", new CreateCategoryDto("Sneaky", 1m, ev.EventId))).StatusCode
            .Should().Be(HttpStatusCode.Forbidden);
        (await other.PutAsJsonAsync($"/api/categories/{cat.CategoryId}", new UpdateCategoryDto("Sneaky", 1m))).StatusCode
            .Should().Be(HttpStatusCode.Forbidden);
        (await other.GetAsync($"/api/events/{ev.EventId}/registrations")).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await owner.PutAsync($"/api/events/{ev.EventId}", EventForm("Renamed by owner"))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.PutAsync($"/api/events/{ev.EventId}", EventForm("Renamed by admin"))).StatusCode.Should().Be(HttpStatusCode.NoContent);

        // only admins may delete events
        (await owner.DeleteAsync($"/api/events/{ev.EventId}")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await admin.DeleteAsync($"/api/events/{ev.EventId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    // ---------- categories ----------

    [Fact]
    public async Task Categories_UpdateAndDelete_WithGuards()
    {
        var admin = await AdminClientAsync();
        var (ev, cat) = await PublishedEventAsync(admin, "Category crud");

        (await admin.PutAsJsonAsync($"/api/categories/{cat.CategoryId}",
                new UpdateCategoryDto("Renamed", 75m, 10m, MaxParticipants: 50, MinAge: 18, MaxAge: 40)))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        var listed = await Client().GetFromJsonAsync<List<CategoryResponseDto>>($"/api/categories?eventId={ev.EventId}");
        listed!.Single().Should().Match<CategoryResponseDto>(c => c.Name == "Renamed" && c.MinAge == 18 && c.MaxParticipants == 50);

        (await admin.PutAsJsonAsync($"/api/categories/{cat.CategoryId}", new UpdateCategoryDto("Bad", 1m, MinAge: 50, MaxAge: 20)))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);

        await RegisterForAsync(await ParticipantClientAsync("catcrud@raceday.test", dob: new DateOnly(1995, 1, 1)), cat.CategoryId);

        // cannot shrink below current registrations or delete a category with registrations
        (await admin.PutAsJsonAsync($"/api/categories/{cat.CategoryId}", new UpdateCategoryDto("Renamed", 75m, MaxParticipants: 1)))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.DeleteAsync($"/api/categories/{cat.CategoryId}")).StatusCode.Should().Be(HttpStatusCode.Conflict);

        var spare = await AddCategoryAsync(admin, new CreateCategoryDto("Spare", 10m, ev.EventId));
        (await admin.DeleteAsync($"/api/categories/{spare.CategoryId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.DeleteAsync("/api/categories/9999")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Categories_OfDraftEvents_AreHiddenFromThePublic()
    {
        var admin = await AdminClientAsync();
        var ev = await CreateEventAsync(admin, "Draft categories");
        await AddCategoryAsync(admin, new CreateCategoryDto("Hidden", 1m, ev.EventId));

        (await Client().GetFromJsonAsync<List<CategoryResponseDto>>($"/api/categories?eventId={ev.EventId}"))!.Should().BeEmpty();
        (await admin.GetFromJsonAsync<List<CategoryResponseDto>>($"/api/categories?eventId={ev.EventId}"))!.Should().HaveCount(1);
    }

    // ---------- registration rules ----------

    [Fact]
    public async Task Registration_RequiresPublishedEvent_AndOpenWindow()
    {
        var admin = await AdminClientAsync();
        var runner = await ParticipantClientAsync("window@raceday.test");

        var draft = await CreateEventAsync(admin, "Draft reg");
        var draftCat = await AddCategoryAsync(admin, new CreateCategoryDto("5km", 1m, draft.EventId));
        (await runner.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(draftCat.CategoryId)))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);

        var (_, closed) = await PublishedEventAsync(admin, "Closed window",
            form: EventForm("Closed window", opens: "2026-01-01T00:00:00", closes: "2026-02-01T00:00:00"));
        (await runner.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(closed.CategoryId)))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);

        var (_, notYet) = await PublishedEventAsync(admin, "Not open yet",
            form: EventForm("Not open yet", opens: "2026-12-30T00:00:00", closes: "2026-12-31T00:00:00"));
        (await runner.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(notYet.CategoryId)))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);

        (await runner.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(99999)))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Registration_EnforcesCategoryCapacity_AndFreesSpotsOnCancel()
    {
        var admin = await AdminClientAsync();
        var (_, cat) = await PublishedEventAsync(admin, "Tiny category",
            id => new CreateCategoryDto("Tiny", 10m, id, MaxParticipants: 1));

        var first = await ParticipantClientAsync("cap1@raceday.test");
        var second = await ParticipantClientAsync("cap2@raceday.test");

        var reg = await RegisterForAsync(first, cat.CategoryId);
        var full = await second.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(cat.CategoryId));
        full.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ErrorOf(full)).Should().Contain("full");

        (await first.DeleteAsync($"/api/registrations/{reg.RegistrationId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var taken = await RegisterForAsync(second, cat.CategoryId);
        taken.RaceNumber.Should().BeGreaterThan(reg.RaceNumber);
    }

    [Fact]
    public async Task Registration_EnforcesVenueCapacity()
    {
        var admin = await AdminClientAsync();
        var venue = await (await admin.PostAsJsonAsync("/api/venues", new SaveVenueDto("Tiny venue", "Nowhere", 1)))
            .Content.ReadFromJsonAsync<VenueDto>();
        var (_, cat) = await PublishedEventAsync(admin, "Venue capped",
            form: EventForm("Venue capped", venueId: venue!.VenueId));

        await RegisterForAsync(await ParticipantClientAsync("vc1@raceday.test"), cat.CategoryId);
        var second = await (await ParticipantClientAsync("vc2@raceday.test"))
            .PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(cat.CategoryId));
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ErrorOf(second)).Should().Contain("venue capacity");
    }

    [Fact]
    public async Task Registration_ChecksAgeAndGenderEligibility()
    {
        var admin = await AdminClientAsync();
        var (_, cat) = await PublishedEventAsync(admin, "Eligibility",
            id => new CreateCategoryDto("Women 18-40", 10m, id, MinAge: 18, MaxAge: 40, Gender: Gender.Female));

        var noProfile = await ParticipantClientAsync("elig-none@raceday.test");
        (await noProfile.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(cat.CategoryId)))
            .StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

        var man = await ParticipantClientAsync("elig-man@raceday.test", dob: new DateOnly(1995, 1, 1), gender: Gender.Male);
        (await man.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(cat.CategoryId)))
            .StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

        var tooYoung = await ParticipantClientAsync("elig-young@raceday.test", dob: new DateOnly(2015, 1, 1), gender: Gender.Female);
        (await tooYoung.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(cat.CategoryId)))
            .StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

        var tooOld = await ParticipantClientAsync("elig-old@raceday.test", dob: new DateOnly(1960, 1, 1), gender: Gender.Female);
        (await tooOld.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(cat.CategoryId)))
            .StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

        var eligible = await ParticipantClientAsync("elig-ok@raceday.test", dob: new DateOnly(1995, 6, 1), gender: Gender.Female);
        await RegisterForAsync(eligible, cat.CategoryId);
    }

    [Fact]
    public async Task Cancel_AndReRegister_ReusesTheRegistration()
    {
        var admin = await AdminClientAsync();
        var (ev, cat) = await PublishedEventAsync(admin, "Cancel flow");
        var runner = await ParticipantClientAsync("cancel@raceday.test");
        var stranger = await ParticipantClientAsync("stranger@raceday.test");

        var reg = await RegisterForAsync(runner, cat.CategoryId);
        (await runner.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(cat.CategoryId)))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);

        // others cannot cancel it
        (await stranger.DeleteAsync($"/api/registrations/{reg.RegistrationId}")).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await runner.DeleteAsync($"/api/registrations/{reg.RegistrationId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await runner.DeleteAsync($"/api/registrations/{reg.RegistrationId}")).StatusCode.Should().Be(HttpStatusCode.Conflict);

        var mine = await runner.GetFromJsonAsync<List<RegistrationResponseDto>>("/api/registrations");
        mine!.Single().Status.Should().Be(RegistrationStatus.Cancelled);

        var again = await RegisterForAsync(runner, cat.CategoryId);
        again.RegistrationId.Should().Be(reg.RegistrationId);
        again.RaceNumber.Should().BeGreaterThan(reg.RaceNumber);
        again.Status.Should().Be(RegistrationStatus.Confirmed);

        (await admin.GetFromJsonAsync<PagedResult<EventResponseDto>>($"/api/events?search=Cancel flow"))!.TotalCount.Should().Be(1);
        (await runner.GetFromJsonAsync<List<RegistrationResponseDto>>("/api/registrations"))!.Should().ContainSingle();
    }

    [Fact]
    public async Task Cancel_IsRejectedAfterTheCancellationPeriod()
    {
        var admin = await AdminClientAsync();
        // registration window is open now but closes shortly: use a window that ends right away via a past close date is not
        // registrable, so create the event in the future and move the close date back directly in the database
        var (ev, cat) = await PublishedEventAsync(admin, "Late cancel");
        var runner = await ParticipantClientAsync("latecancel@raceday.test");
        var reg = await RegisterForAsync(runner, cat.CategoryId);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<RaceDayDbContext>();
            var e = await db.Events.FindAsync(ev.EventId);
            e!.RegistrationClosesAt = DateTime.UtcNow.AddDays(-1);
            await db.SaveChangesAsync();
        }

        (await runner.DeleteAsync($"/api/registrations/{reg.RegistrationId}")).StatusCode.Should().Be(HttpStatusCode.Conflict);
        // organizers/admins can still cancel on behalf of the participant
        (await admin.DeleteAsync($"/api/registrations/{reg.RegistrationId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    // ---------- organizer registration tools ----------

    [Fact]
    public async Task EventRegistrations_ListFilterPaymentAndCsvExport()
    {
        var owner = await OrganizerClientAsync("regowner@raceday.test");
        var (ev, cat) = await PublishedEventAsync(owner, "Roster event");
        var other = await AddCategoryAsync(owner, new CreateCategoryDto("Other", 5m, ev.EventId));

        var evil = await ParticipantClientAsync("evil@raceday.test", fullName: "=HYPERLINK(\"http://x\")");
        var regEvil = await RegisterForAsync(evil, cat.CategoryId);
        await RegisterForAsync(await ParticipantClientAsync("nice@raceday.test", fullName: "Nice Person"), other.CategoryId);

        var all = await owner.GetFromJsonAsync<List<ParticipantDto>>($"/api/events/{ev.EventId}/registrations");
        all!.Should().HaveCount(2);

        (await owner.GetFromJsonAsync<List<ParticipantDto>>($"/api/events/{ev.EventId}/registrations?categoryId={other.CategoryId}"))!
            .Should().ContainSingle().Which.ParticipantName.Should().Be("Nice Person");

        // payment management
        (await evil.PatchAsJsonAsync($"/api/registrations/{regEvil.RegistrationId}/payment", new UpdatePaymentDto(PaymentStatus.Paid)))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await owner.PatchAsJsonAsync($"/api/registrations/{regEvil.RegistrationId}/payment", new UpdatePaymentDto(PaymentStatus.Paid)))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await owner.GetFromJsonAsync<List<ParticipantDto>>($"/api/events/{ev.EventId}/registrations?paymentStatus=Paid"))!
            .Should().ContainSingle().Which.RegistrationId.Should().Be(regEvil.RegistrationId);

        // CSV export neutralises formula injection
        var csv = await owner.GetAsync($"/api/events/{ev.EventId}/registrations?format=csv");
        csv.StatusCode.Should().Be(HttpStatusCode.OK);
        csv.Content.Headers.ContentType!.MediaType.Should().Be("text/csv");
        var text = await csv.Content.ReadAsStringAsync();
        text.Should().StartWith("RaceNumber,Name,Email");
        text.Should().Contain("\"'=HYPERLINK");
        text.Should().Contain("Paid");

        // participants cannot use the organizer endpoint
        (await evil.GetAsync($"/api/events/{ev.EventId}/registrations")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ---------- results ----------

    [Fact]
    public async Task FullRaceFlow_Register_RecordTimes_AndRankWithTies()
    {
        var admin = await AdminClientAsync();
        var (ev, category) = await PublishedEventAsync(admin, "Flow Race");

        var regs = new List<RegistrationResponseDto>();
        foreach (var email in new[] { "r1@raceday.test", "r2@raceday.test", "r3@raceday.test" })
        {
            var runner = await ParticipantClientAsync(email);
            regs.Add(await RegisterForAsync(runner, category.CategoryId));

            // duplicate registration is rejected
            (await runner.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(category.CategoryId)))
                .StatusCode.Should().Be(HttpStatusCode.Conflict);
        }
        regs.Select(r => r.RaceNumber).Should().Equal(1, 2, 3);

        var times = new[] { "00:45:00", "00:40:00", "00:45:00" };
        for (int i = 0; i < 3; i++)
        {
            var res = await admin.PostAsJsonAsync("/api/results", new RecordTimingDto(regs[i].RegistrationId, TimeSpan.Parse(times[i])));
            res.StatusCode.Should().Be(HttpStatusCode.OK);
        }

        var board = await Client().GetFromJsonAsync<List<LeaderboardDto>>($"/api/results/leaderboard/{category.CategoryId}");
        board!.Select(b => b.Rank).Should().Equal(1, 2, 2);
        board[0].RaceNumber.Should().Be(2);

        // participants only see their own registrations
        var mine = await (await LoginAsync(Client(), "r1@raceday.test", "Password123!"))
            .GetFromJsonAsync<List<RegistrationResponseDto>>("/api/registrations");
        mine.Should().ContainSingle();

        // events with registrations cannot be deleted
        (await admin.DeleteAsync($"/api/events/{ev.EventId}")).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Results_SupportDnf_UpdateDelete_AndEventListing()
    {
        var owner = await OrganizerClientAsync("resowner@raceday.test");
        var (ev, cat) = await PublishedEventAsync(owner, "Results admin");
        var a = await RegisterForAsync(await ParticipantClientAsync("res-a@raceday.test"), cat.CategoryId);
        var b = await RegisterForAsync(await ParticipantClientAsync("res-b@raceday.test"), cat.CategoryId);
        var c = await RegisterForAsync(await ParticipantClientAsync("res-c@raceday.test"), cat.CategoryId);

        (await owner.PostAsJsonAsync("/api/results", new RecordTimingDto(a.RegistrationId, TimeSpan.FromMinutes(50)))).StatusCode.Should().Be(HttpStatusCode.OK);
        (await owner.PostAsJsonAsync("/api/results", new RecordTimingDto(b.RegistrationId, TimeSpan.FromMinutes(40)))).StatusCode.Should().Be(HttpStatusCode.OK);
        (await owner.PostAsJsonAsync("/api/results", new RecordTimingDto(c.RegistrationId, null, ResultStatus.DNF))).StatusCode.Should().Be(HttpStatusCode.OK);

        // validation
        (await owner.PostAsJsonAsync("/api/results", new RecordTimingDto(a.RegistrationId, null))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await owner.PostAsJsonAsync("/api/results", new RecordTimingDto(c.RegistrationId, TimeSpan.FromMinutes(1), ResultStatus.DSQ)))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var anon = Client();
        var board = await anon.GetFromJsonAsync<List<LeaderboardDto>>($"/api/results/leaderboard/{cat.CategoryId}");
        board!.Should().HaveCount(2); // DNF is not on the leaderboard
        board.Select(x => x.Rank).Should().Equal(1, 2);

        var results = await anon.GetFromJsonAsync<List<ResultResponseDto>>($"/api/results/event/{ev.EventId}");
        results!.Should().HaveCount(3);
        results.Single(r => r.Status == ResultStatus.DNF).Rank.Should().BeNull();
        var resultA = results.Single(r => r.RegistrationId == a.RegistrationId);

        // correcting a time re-ranks the category
        (await owner.PutAsJsonAsync($"/api/results/{resultA.ResultId}", new UpdateResultDto(TimeSpan.FromMinutes(30))))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await anon.GetFromJsonAsync<List<LeaderboardDto>>($"/api/results/leaderboard/{cat.CategoryId}"))![0]
            .RaceNumber.Should().Be(a.RaceNumber);

        // deleting a result removes it from the board
        (await owner.DeleteAsync($"/api/results/{resultA.ResultId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var after = await anon.GetFromJsonAsync<List<LeaderboardDto>>($"/api/results/leaderboard/{cat.CategoryId}");
        after!.Should().ContainSingle().Which.Rank.Should().Be(1);

        // a result blocks cancellation
        (await owner.PostAsJsonAsync("/api/results", new RecordTimingDto(b.RegistrationId, TimeSpan.FromMinutes(40)))).StatusCode.Should().Be(HttpStatusCode.OK);
        (await owner.DeleteAsync($"/api/registrations/{b.RegistrationId}")).StatusCode.Should().Be(HttpStatusCode.Conflict);

        // other organizers cannot touch these results
        var other = await OrganizerClientAsync("resother@raceday.test");
        (await other.PostAsJsonAsync("/api/results", new RecordTimingDto(a.RegistrationId, TimeSpan.FromMinutes(1)))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task MyRegistrations_IncludeEventDetails_AndWhetherTheyCanBeCancelled()
    {
        var admin = await AdminClientAsync();
        var (ev, cat) = await PublishedEventAsync(admin, "My race details",
            id => new CreateCategoryDto("10km", 120m, id));
        var runner = await ParticipantClientAsync("mine-details@raceday.test");

        var registered = await RegisterForAsync(runner, cat.CategoryId);
        registered.CanCancel.Should().BeTrue();
        registered.EntryFee.Should().Be(120m);
        registered.EventDate.Should().Be(new DateTime(2027, 1, 1, 8, 0, 0));

        var listed = (await runner.GetFromJsonAsync<List<RegistrationResponseDto>>("/api/registrations"))!.Single();
        listed.EventTitle.Should().Be("My race details");
        listed.EventStatus.Should().Be(EventStatus.Published);
        listed.CanCancel.Should().BeTrue();
        listed.HasResult.Should().BeFalse();

        // once a result exists the registration can no longer be cancelled
        (await admin.PostAsJsonAsync("/api/results", new RecordTimingDto(registered.RegistrationId, TimeSpan.FromMinutes(45))))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        var afterResult = (await runner.GetFromJsonAsync<List<RegistrationResponseDto>>("/api/registrations"))!.Single();
        afterResult.HasResult.Should().BeTrue();
        afterResult.CanCancel.Should().BeFalse();

        // a cancelled registration is not cancellable either
        var (_, cat2) = await PublishedEventAsync(admin, "My race cancelled");
        var second = await RegisterForAsync(runner, cat2.CategoryId);
        (await runner.DeleteAsync($"/api/registrations/{second.RegistrationId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await runner.GetFromJsonAsync<List<RegistrationResponseDto>>("/api/registrations"))!
            .Single(r => r.RegistrationId == second.RegistrationId).CanCancel.Should().BeFalse();
    }

    [Fact]
    public async Task MyResults_ListOnlyTheCallersResults_WithRankAndFinisherCount()
    {
        var admin = await AdminClientAsync();
        var (ev, cat) = await PublishedEventAsync(admin, "My results race");

        var me = await ParticipantClientAsync("myres-me@raceday.test");
        var other = await ParticipantClientAsync("myres-other@raceday.test");
        var third = await ParticipantClientAsync("myres-third@raceday.test");
        var mine = await RegisterForAsync(me, cat.CategoryId);
        var theirs = await RegisterForAsync(other, cat.CategoryId);
        var dnf = await RegisterForAsync(third, cat.CategoryId);

        (await me.GetFromJsonAsync<List<MyResultDto>>("/api/results/mine"))!.Should().BeEmpty();

        await admin.PostAsJsonAsync("/api/results", new RecordTimingDto(mine.RegistrationId, TimeSpan.FromMinutes(50)));
        await admin.PostAsJsonAsync("/api/results", new RecordTimingDto(theirs.RegistrationId, TimeSpan.FromMinutes(40)));
        await admin.PostAsJsonAsync("/api/results", new RecordTimingDto(dnf.RegistrationId, null, ResultStatus.DNF));

        var results = await me.GetFromJsonAsync<List<MyResultDto>>("/api/results/mine");
        var result = results!.Should().ContainSingle().Subject;
        result.EventTitle.Should().Be("My results race");
        result.Rank.Should().Be(2);
        result.Finishers.Should().Be(2); // the DNF does not count
        result.FinishTime.Should().Be(TimeSpan.FromMinutes(50));
        result.RaceNumber.Should().Be(mine.RaceNumber);

        var dnfResults = await third.GetFromJsonAsync<List<MyResultDto>>("/api/results/mine");
        dnfResults!.Single().Should().Match<MyResultDto>(r => r.Status == ResultStatus.DNF && r.Rank == null && r.FinishTime == null);

        (await Client().GetAsync("/api/results/mine")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Results_ImportFromCsv_ReportsLineErrors()
    {
        var admin = await AdminClientAsync();
        var (ev, cat) = await PublishedEventAsync(admin, "Import race");
        var a = await RegisterForAsync(await ParticipantClientAsync("imp-a@raceday.test"), cat.CategoryId);
        var b = await RegisterForAsync(await ParticipantClientAsync("imp-b@raceday.test"), cat.CategoryId);
        var c = await RegisterForAsync(await ParticipantClientAsync("imp-c@raceday.test"), cat.CategoryId);

        var csv = $"raceNumber,finishTime,status\n{a.RaceNumber},00:41:00\n{b.RaceNumber},00:39:30.500\n{c.RaceNumber},,DNF\n99,00:30:00\n{a.RaceNumber},45:00\n{b.RaceNumber},abc\n";
        using var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(csv)), "file", "results.csv");

        var response = await admin.PostAsync($"/api/results/import?eventId={ev.EventId}", form);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var summary = await response.Content.ReadFromJsonAsync<ImportResultDto>();
        summary!.Imported.Should().Be(4); // "45:00" is 45 minutes and replaces the first time of the same bib
        summary.Errors.Select(e => e.Line).Should().Equal(5, 7);

        var board = await Client().GetFromJsonAsync<List<LeaderboardDto>>($"/api/results/leaderboard/{cat.CategoryId}");
        board!.Select(x => x.RaceNumber).Should().Equal(b.RaceNumber, a.RaceNumber);
        board[0].FinishTime.Should().Be(new TimeSpan(0, 0, 39, 30, 500));

        (await Client().PostAsync($"/api/results/import?eventId={ev.EventId}", form)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ---------- stats ----------

    [Fact]
    public async Task Stats_AreAdminOnly()
    {
        var admin = await AdminClientAsync();
        var stats = await admin.GetFromJsonAsync<StatsDto>("/api/stats");
        stats!.EventsByStatus.Keys.Should().BeEquivalentTo("Draft", "Published", "Cancelled", "Completed");
        stats.Users.Should().BeGreaterThan(0);

        var participant = await ParticipantClientAsync("stats@raceday.test");
        (await participant.GetAsync("/api/stats")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await Client().GetAsync("/api/stats")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}

/// <summary>Serves a throw-away web root so the SPA fallback can be tested without building the frontend.</summary>
public class WebRootFactory : RaceDayFactory
{
    public string WebRoot { get; } = Directory.CreateTempSubdirectory("raceday-wwwroot-").FullName;

    protected override void ConfigureHost(IWebHostBuilder builder)
    {
        File.WriteAllText(Path.Combine(WebRoot, "index.html"), "<!doctype html><title>SPA shell</title>");
        File.WriteAllText(Path.Combine(WebRoot, "app.js"), "console.log('app');");
        builder.UseWebRoot(WebRoot);
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing && Directory.Exists(WebRoot)) Directory.Delete(WebRoot, recursive: true);
    }
}

public class RaceDaySpaHostingTests : IClassFixture<WebRootFactory>
{
    private readonly WebRootFactory _factory;

    public RaceDaySpaHostingTests(WebRootFactory factory) => _factory = factory;

    [Theory]
    [InlineData("/")]
    [InlineData("/events/12")]
    [InlineData("/manage/events/3/results")]
    public async Task ClientSideRoutes_FallBackToTheSpaShell(string path)
    {
        var response = await _factory.CreateClient().GetAsync(path);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("text/html");
        (await response.Content.ReadAsStringAsync()).Should().Contain("SPA shell");
    }

    [Fact]
    public async Task StaticFiles_AreServed_AndApiRoutesAreNeverShadowed()
    {
        var client = _factory.CreateClient();

        (await client.GetStringAsync("/app.js")).Should().Contain("console.log");
        (await client.GetAsync("/health")).Content.Headers.ContentType!.MediaType.Should().NotBe("text/html");
        (await client.GetFromJsonAsync<List<VenueDto>>("/api/venues"))!.Should().NotBeEmpty();

        // a missing file is a 404 too, not the shell
        (await client.GetAsync("/missing.js")).StatusCode.Should().Be(HttpStatusCode.NotFound);

        // an unknown API route is a real 404, not the SPA shell
        var unknown = await client.GetAsync("/api/does-not-exist");
        unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await unknown.Content.ReadAsStringAsync()).Should().NotContain("SPA shell");
    }
}

/// <summary>A file-backed SQLite database with real connections, so requests truly overlap.</summary>
public class FileDatabaseFactory : RaceDayFactory
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"raceday-test-{Guid.NewGuid():N}.db");

    protected override void ConfigureDatabase(DbContextOptionsBuilder options) => options.UseSqlite($"Data Source={_path}");

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;
        SqliteConnection.ClearAllPools();
        foreach (var file in Directory.GetFiles(Path.GetTempPath(), Path.GetFileName(_path) + "*")) File.Delete(file);
    }
}

public class RaceDayConcurrencyTests : IClassFixture<FileDatabaseFactory>
{
    private readonly FileDatabaseFactory _factory;

    public RaceDayConcurrencyTests(FileDatabaseFactory factory) => _factory = factory;

    private async Task<HttpClient> LoginAsync(string email, string password)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginDto(email, password));
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!.Token);
        return client;
    }

    [Fact]
    public async Task SimultaneousRegistrations_GetUniqueRaceNumbers_AndNeverExceedTheCategoryCapacity()
    {
        const int runners = 12;
        const int capacity = 7;

        var admin = await LoginAsync(RaceDayFactory.AdminEmail, RaceDayFactory.AdminPassword);

        var form = new MultipartFormDataContent
        {
            { new StringContent("Concurrent race"), "Title" },
            { new StringContent("2099-01-01T08:00:00"), "EventDate" },
            { new StringContent("1"), "VenueId" },
        };
        var created = await (await admin.PostAsync("/api/events", form)).Content.ReadFromJsonAsync<EventResponseDto>();
        var category = await (await admin.PostAsJsonAsync("/api/categories", new CreateCategoryDto("10km", 0m, created!.EventId, MaxParticipants: capacity)))
            .Content.ReadFromJsonAsync<CategoryResponseDto>();
        (await admin.PostAsync($"/api/events/{created.EventId}/publish", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        // sign everyone up first (password hashing is slow), then register all of them at once
        var clients = new List<HttpClient>();
        for (int i = 0; i < runners; i++)
        {
            var email = $"concurrent{i}@raceday.test";
            (await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterDto($"Runner {i}", email, "Password123!")))
                .StatusCode.Should().Be(HttpStatusCode.Created);
            clients.Add(await LoginAsync(email, "Password123!"));
        }

        var responses = await Task.WhenAll(clients.Select(c => c.PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(category!.CategoryId))));

        var succeeded = responses.Where(r => r.StatusCode == HttpStatusCode.Created).ToList();
        succeeded.Should().HaveCount(capacity, "the category has room for exactly that many");
        responses.Where(r => r.StatusCode != HttpStatusCode.Created).Should().OnlyContain(r => r.StatusCode == HttpStatusCode.Conflict);

        var numbers = new List<int>();
        foreach (var r in succeeded) numbers.Add((await r.Content.ReadFromJsonAsync<RegistrationResponseDto>())!.RaceNumber);
        numbers.Should().OnlyHaveUniqueItems();
        numbers.OrderBy(n => n).Should().Equal(Enumerable.Range(1, capacity));
    }
}

public class DemoSeedFactory : RaceDayFactory
{
    protected override bool SeedDemoUsers => true;
}

public class RaceDayDemoSeedTests : IClassFixture<DemoSeedFactory>
{
    private readonly DemoSeedFactory _factory;

    public RaceDayDemoSeedTests(DemoSeedFactory factory) => _factory = factory;

    private async Task<HttpResponseMessage> LoginAsync(RaceDayApi.Server.Data.DemoUser user, HttpClient? client = null) =>
        await (client ?? _factory.CreateClient()).PostAsJsonAsync("/api/auth/login", new LoginDto(user.Email, user.Password));

    private async Task<HttpClient> SignedInAsync(string email)
    {
        var user = RaceDayApi.Server.Data.DatabaseSeeder.DemoUsers.Single(u => u.Email == email);
        var client = _factory.CreateClient();
        var response = await LoginAsync(user, client);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!.Token);
        return client;
    }

    private async Task<HttpClient> AdminAsync()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginDto(RaceDayFactory.AdminEmail, RaceDayFactory.AdminPassword));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!.Token);
        return client;
    }

    [Fact]
    public async Task EveryDemoUser_CanSignIn_WithTheirRole_ExceptTheDeactivatedOne()
    {
        foreach (var user in RaceDayApi.Server.Data.DatabaseSeeder.DemoUsers)
        {
            var response = await LoginAsync(user);
            if (!user.IsActive)
            {
                response.StatusCode.Should().Be(HttpStatusCode.Unauthorized, user.Email);
                continue;
            }

            response.StatusCode.Should().Be(HttpStatusCode.OK, user.Email);
            (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!.Role.Should().Be(user.Role, user.Email);
        }
    }

    [Fact]
    public async Task DemoUsers_CoverEveryRoleAndTheProfileEdgeCases()
    {
        var users = RaceDayApi.Server.Data.DatabaseSeeder.DemoUsers;
        users.Select(u => u.Role).Distinct().Should().BeEquivalentTo(["Organizer", "Participant"]); // admin comes from Seed:Admin*
        users.Count(u => !u.IsActive).Should().Be(1);
        users.Should().Contain(u => u.Role == "Participant" && u.Gender == Gender.Female && u.DateOfBirth != null);
        users.Should().Contain(u => u.Role == "Participant" && u.Gender == Gender.Male && u.DateOfBirth != null);
        users.Should().Contain(u => u.Role == "Participant" && u.IsActive && u.Gender == null && u.DateOfBirth == null);
        users.Select(u => u.Email).Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task TheOrganizerCanCreateEvents_AndTheParticipantsCannot()
    {
        var form = () => new MultipartFormDataContent
        {
            { new StringContent("Demo seed event"), "Title" },
            { new StringContent("2099-01-01T08:00:00"), "EventDate" },
            { new StringContent("1"), "VenueId" },
        };

        (await (await SignedInAsync("organizer@raceday.local")).PostAsync("/api/events", form())).StatusCode.Should().Be(HttpStatusCode.Created);
        (await (await SignedInAsync("participant@raceday.local")).PostAsync("/api/events", form())).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task TheDemoProfiles_DriveCategoryEligibility()
    {
        var organizer = await SignedInAsync("organizer@raceday.local");
        var created = await (await organizer.PostAsync("/api/events", new MultipartFormDataContent
        {
            { new StringContent("Women only demo"), "Title" },
            { new StringContent("2099-01-01T08:00:00"), "EventDate" },
            { new StringContent("1"), "VenueId" },
        })).Content.ReadFromJsonAsync<EventResponseDto>();
        var category = await (await organizer.PostAsJsonAsync("/api/categories", new CreateCategoryDto("Women 10 km", 0m, created!.EventId, MinAge: 18, Gender: Gender.Female)))
            .Content.ReadFromJsonAsync<CategoryResponseDto>();
        (await organizer.PostAsync($"/api/events/{created.EventId}/publish", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        async Task<HttpStatusCode> RegisterAs(string email) =>
            (await (await SignedInAsync(email)).PostAsJsonAsync("/api/registrations", new CreateRegistrationDto(category!.CategoryId))).StatusCode;

        (await RegisterAs("participant@raceday.local")).Should().Be(HttpStatusCode.Created);              // woman, over 18
        (await RegisterAs("runner@raceday.local")).Should().Be(HttpStatusCode.UnprocessableEntity);       // man
        (await RegisterAs("newcomer@raceday.local")).Should().Be(HttpStatusCode.UnprocessableEntity);     // no profile yet
    }

    [Fact]
    public async Task Seeding_IsIdempotent_AndNeverOverwritesExistingAccounts()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<RaceDayDbContext>();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();

        var before = await db.Users.CountAsync();
        var hash = (await db.Users.SingleAsync(u => u.Email == "organizer@raceday.local")).PasswordHash;

        RaceDayApi.Server.Data.DatabaseSeeder.Seed(db, config, scope.ServiceProvider.GetRequiredService<ILogger<RaceDayDemoSeedTests>>(), isDevelopment: true);

        (await db.Users.CountAsync()).Should().Be(before);
        (await db.Users.SingleAsync(u => u.Email == "organizer@raceday.local")).PasswordHash.Should().Be(hash);
    }

    [Fact]
    public async Task AnAdminSeesAllDemoUsersInTheUserList()
    {
        var admin = await AdminAsync();
        var users = await admin.GetFromJsonAsync<PagedResult<UserSummaryDto>>("/api/users?search=%40raceday.local&pageSize=50");

        users!.Items.Select(u => u.Email).Should().Contain(RaceDayApi.Server.Data.DatabaseSeeder.DemoUsers.Select(u => u.Email));
        users.Items.Single(u => u.Email == "inactive@raceday.local").IsActive.Should().BeFalse();
    }
}
