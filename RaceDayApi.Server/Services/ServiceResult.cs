namespace RaceDayApi.Server.Services;

public record ServiceResult<T>(T? Value, int StatusCode, string? Error)
{
    public bool IsSuccess => Error == null;

    public static ServiceResult<T> Success(T value, int statusCode = 200) => new(value, statusCode, null);

    public static ServiceResult<T> Fail(int statusCode, string error) => new(default, statusCode, error);
}
