using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.ServiceDiscovery;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace Microsoft.Extensions.Hosting;

public static class ServiceDefaultsExtensions
{
    private const string HealthPath = "/health";
    private const string AlivePath = "/alive";

    /// <summary>
    /// Applies standard Aspire plumbing: service discovery, resilient HTTP clients, health checks, and telemetry.
    /// </summary>
    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();
        builder.AddDefaultHealthChecks();

        builder.Services.AddServiceDiscovery();

        // Setup standard resilience and service discovery for all outgoing HTTP calls
        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            http.AddStandardResilienceHandler();
            http.AddServiceDiscovery();
        });

        // Uncomment if you want to lock down service discovery schemes:
        // builder.Services.Configure<ServiceDiscoveryOptions>(options => options.AllowedSchemes = ["https"]);

        return builder;
    }

    public static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics => metrics
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation())
            .WithTracing(tracing => tracing
                .AddSource(builder.Environment.ApplicationName)
                .AddAspNetCoreInstrumentation(options =>
                {
                    // Skip tracing health/aliveness checks to keep logs clean
                    options.Filter = ctx =>
                        !ctx.Request.Path.StartsWithSegments(HealthPath) &&
                        !ctx.Request.Path.StartsWithSegments(AlivePath);
                })
                .AddHttpClientInstrumentation());

        // Hook up OTLP exporter if the environment variable is present
        if (!string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        return builder;
    }

    public static TBuilder AddDefaultHealthChecks<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        // Basic liveness probe to verify the service is running
        builder.Services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }

    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        // Exposed in development, or wherever Health:Enabled=true (e.g. a container behind an orchestrator).
        // They only report "Healthy" and carry no data, but stay opt-in outside development.
        if (app.Environment.IsDevelopment() || app.Configuration.GetValue("Health:Enabled", false))
        {
            // Full readiness check
            app.MapHealthChecks(HealthPath);

            // Lightweight liveness check
            app.MapHealthChecks(AlivePath, new HealthCheckOptions
            {
                Predicate = r => r.Tags.Contains("live")
            });
        }

        return app;
    }
}