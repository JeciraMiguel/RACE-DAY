using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RaceDayApi.Server.Migrations
{
    /// <inheritdoc />
    public partial class VenueTimeZone : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TimeZone",
                table: "Venues",
                type: "TEXT",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TimeZone",
                table: "Venues");
        }
    }
}
