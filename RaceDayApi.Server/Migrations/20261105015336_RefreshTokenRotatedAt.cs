using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RaceDayApi.Server.Migrations
{
    /// <inheritdoc />
    public partial class RefreshTokenRotatedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "RotatedAt",
                table: "RefreshTokens",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RotatedAt",
                table: "RefreshTokens");
        }
    }
}
