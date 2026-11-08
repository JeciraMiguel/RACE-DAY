var builder = DistributedApplication.CreateBuilder(args);

// Azurite (Azure Storage emulator, runs in a container) keeps event banner uploads working locally.
// The server reads the injected "blobs" connection string; no manual `docker run` needed.
var storage = builder.AddAzureStorage("storage").RunAsEmulator();
var blobs = storage.AddBlobs("blobs");

var server = builder.AddProject<Projects.RaceDayApi_Server>("server")
    .WithReference(blobs)
    .WaitFor(blobs)
    .WithHttpHealthCheck("/health")
    .WithExternalHttpEndpoints();

var webfrontend = builder.AddViteApp("webfrontend", "../frontend")
    .WithReference(server)
    .WaitFor(server);

// When publishing, the built frontend is served by the server from wwwroot
server.PublishWithContainerFiles(webfrontend, "wwwroot");

builder.Build().Run();
