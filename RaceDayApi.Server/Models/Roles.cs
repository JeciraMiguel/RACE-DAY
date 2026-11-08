namespace RaceDayApi.Server.Models;

public static class Roles
{
    public const string Admin = "Admin";
    public const string Organizer = "Organizer";
    public const string Participant = "Participant";
    public const string AdminOrOrganizer = Admin + "," + Organizer;
}
