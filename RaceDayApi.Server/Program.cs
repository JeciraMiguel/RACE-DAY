using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.RateLimiting;
using RaceDayApi.Server.Authorization;
using RaceDayApi.Server.Data;
using System.Threading.RateLimiting;
using RaceDayApi.Server.Models;
using RaceDayApi.Server.Services;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Database configuration (SQLite)
builder.Services.AddDbContext<RaceDayDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// Azure Blob Storage Service Registration
builder.Services.AddScoped<IBlobService, BlobService>();
builder.Services.AddScoped<RankingService>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<RegistrationService>();

builder.Services.AddProblemDetails();

builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new Microsoft.OpenApi.OpenApiInfo
    {
        Title = "RaceDay API",
        Version = "v1",
        Description = "Events, categories, registrations and results for race organizers and participants."
    });
    var xmlFile = Path.Combine(AppContext.BaseDirectory, $"{typeof(Program).Assembly.GetName().Name}.xml");
    if (File.Exists(xmlFile)) options.IncludeXmlComments(xmlFile);

    // Enables the "Authorize" button: paste the JWT returned by /api/auth/login
    options.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.OpenApiSecurityScheme
    {
        Type = Microsoft.OpenApi.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "JWT access token from POST /api/auth/login"
    });
    options.AddSecurityRequirement(document => new Microsoft.OpenApi.OpenApiSecurityRequirement
    {
        [new Microsoft.OpenApi.OpenApiSecuritySchemeReference("Bearer", document)] = []
    });
});

// JWT Authentication configuration. The key has no fallback: it must come from
// configuration (user-secrets / environment variables / appsettings.Development.json).
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Jwt:Key must be configured with at least 32 characters.");

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ClockSkew = TimeSpan.FromSeconds(30), // short-lived tokens: do not allow the 5 minute default
        ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "RaceDayApi",
        ValidAudience = builder.Configuration["Jwt:Audience"] ?? "RaceDayUsers",
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
    };

    // Reject tokens of deactivated users and tokens issued before a role/password change
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = async context =>
        {
            var principal = context.Principal;
            var userId = principal?.GetUserId();
            var version = principal?.FindFirst(TokenService.TokenVersionClaim)?.Value;

            var db = context.HttpContext.RequestServices.GetRequiredService<RaceDayDbContext>();
            var user = userId == null
                ? null
                : await db.Users.AsNoTracking()
                    .Where(u => u.UserId == userId)
                    .Select(u => new { u.IsActive, u.TokenVersion })
                    .FirstOrDefaultAsync();

            if (user == null || !user.IsActive || version != user.TokenVersion.ToString())
                context.Fail("Token is no longer valid.");
        }
    };
});

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsJsonAsync(new Microsoft.AspNetCore.Mvc.ProblemDetails
        {
            Status = 429,
            Title = "Too Many Requests",
            Detail = "Too many requests, please slow down."
        }, options: null, contentType: "application/problem+json", cancellationToken: token);
    };

    // Per client IP, on the credential endpoints; the limit is read per request so tests can lower it
    options.AddPolicy("auth", httpContext =>
    {
        var limit = httpContext.RequestServices.GetRequiredService<IConfiguration>().GetValue("RateLimit:AuthPerMinute", 30);
        return RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = limit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 });
    });
});

builder.Services.AddAuthorization(Policies.Configure);
builder.Services.AddSingleton<Microsoft.AspNetCore.Authorization.IAuthorizationHandler, EventOwnerHandler>();

var app = builder.Build();

// Unhandled exceptions and bare 401/403/404 responses become ProblemDetails
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Behind a TLS-terminating proxy or inside a plain-HTTP container the redirect has nowhere to go
if (!app.Configuration.GetValue("DisableHttpsRedirection", false)) app.UseHttpsRedirection();

// Serve the built React app (wwwroot) when it is present, e.g. in the Docker image or after publishing
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapDefaultEndpoints();

// Client-side routes (/events/1, /manage...) fall back to index.html. API, Swagger and health routes are
// excluded, and so are paths that look like files (a missing /app.js must be a 404, and existing files are
// handled by the static files middleware, which skips requests that matched an endpoint).
if (File.Exists(Path.Combine(app.Environment.WebRootPath ?? string.Empty, "index.html")))
{
    app.MapFallbackToFile(@"/{*path:regex(^(?!api/|swagger|health|alive)(?!.*\.\w+$).*$)}", "index.html");
}

// Apply migrations and seed initial data
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<RaceDayDbContext>();
    dbContext.Database.Migrate();

    DatabaseSeeder.Seed(dbContext, app.Configuration, app.Logger, app.Environment.IsDevelopment());
}

app.Run();

// Exposed so integration tests can use WebApplicationFactory<Program>
public partial class Program { }
