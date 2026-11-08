namespace RaceDayApi.Server.Services;

public interface IBlobService
{
    Task<string> UploadFileAsync(IFormFile file, string containerName);
    Task DeleteFileAsync(string fileUrl, string containerName);
}