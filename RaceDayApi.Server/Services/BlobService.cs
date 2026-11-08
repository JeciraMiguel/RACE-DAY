using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace RaceDayApi.Server.Services;

public class BlobService : IBlobService
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly string? _publicBaseUrl;

    public BlobService(IConfiguration configuration)
    {
        // "blobs" is the connection Aspire injects for the Azurite emulator; the explicit setting wins
        var connectionString = configuration["AzureBlobStorage:ConnectionString"]
            ?? configuration.GetConnectionString("blobs")
            ?? "UseDevelopmentStorage=true"; // local emulator
        _blobServiceClient = new BlobServiceClient(connectionString);

        // The address clients (browsers) use to fetch blobs can differ from the one the server uses to reach
        // the storage: a container hostname inside Docker, or a CDN in front of the account in production
        _publicBaseUrl = configuration["AzureBlobStorage:PublicBaseUrl"]?.TrimEnd('/');
    }

    public async Task<string> UploadFileAsync(IFormFile file, string containerName)
    {
        if (file == null || file.Length == 0)
            throw new ArgumentException("File is empty.");

        var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
        await containerClient.CreateIfNotExistsAsync(PublicAccessType.Blob);

        var fileName = $"{Guid.NewGuid():N}{Path.GetExtension(file.FileName).ToLowerInvariant()}";
        var blobClient = containerClient.GetBlobClient(fileName);

        using (var stream = file.OpenReadStream())
        {
            await blobClient.UploadAsync(stream, new BlobHttpHeaders { ContentType = file.ContentType });
        }

        return _publicBaseUrl is null ? blobClient.Uri.ToString() : $"{_publicBaseUrl}/{containerName}/{fileName}";
    }

    public async Task DeleteFileAsync(string fileUrl, string containerName)
    {
        if (string.IsNullOrWhiteSpace(fileUrl)) return;

        var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
        var fileName = Path.GetFileName(new Uri(fileUrl).AbsolutePath);
        var blobClient = containerClient.GetBlobClient(fileName);

        await blobClient.DeleteIfExistsAsync();
    }
}