using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Windows;
using Application = System.Windows.Application;
using MessageBox = System.Windows.MessageBox;

namespace Cet6WordAssistant;

internal static class DesktopUpdater
{
    private static readonly HttpClient Client = CreateClient();
    private static readonly SemaphoreSlim Gate = new(1, 1);

    internal sealed record CheckResult(string Status, string Version);

    public static async Task<CheckResult> CheckAsync(Window owner, IEnumerable<string> manifestUrls, bool userInitiated)
    {
        var urls = manifestUrls
            .Select(value => Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps ? uri : null)
            .Where(uri => uri is not null)
            .Cast<Uri>()
            .Distinct()
            .ToArray();
        if (urls.Length == 0)
        {
            if (userInitiated) MessageBox.Show(owner, "此版本尚未配置可信的 HTTPS 更新源。", "暂时无法检查更新", MessageBoxButton.OK, MessageBoxImage.Information);
            return new CheckResult("cancelled", CurrentVersion());
        }
        if (!await Gate.WaitAsync(0)) return new CheckResult("cancelled", CurrentVersion());
        try
        {
            var (manifestUri, manifest) = await FetchLatestAsync(urls);
            var currentText = CurrentVersion();
            var current = Version.Parse(currentText);
            if (!Version.TryParse(manifest.Version, out var available)) throw new InvalidDataException("更新版本号无效");
            if (available <= current)
            {
                if (userInitiated) MessageBox.Show(owner, $"当前版本：{currentText}", "已经是最新版", MessageBoxButton.OK, MessageBoxImage.Information);
                return new CheckResult("current", currentText);
            }
            var answer = MessageBox.Show(owner, $"生词助手 {manifest.Version} 已发布。\n\n{manifest.Notes}\n\n是否现在下载并更新？",
                "发现生词助手更新", MessageBoxButton.YesNo, MessageBoxImage.Information);
            if (answer != MessageBoxResult.Yes) return new CheckResult("cancelled", manifest.Version);
            var installed = await DownloadAndInstallAsync(owner, manifestUri, manifest);
            return new CheckResult(installed ? "installing" : "cancelled", manifest.Version);
        }
        catch (Exception error)
        {
            if (userInitiated) MessageBox.Show(owner, $"请确认网络和更新发布通道可用。\n\n{error.Message}", "检查更新失败", MessageBoxButton.OK, MessageBoxImage.Warning);
            return new CheckResult("cancelled", CurrentVersion());
        }
        finally { Gate.Release(); }
    }

    private static async Task<(Uri, UpdateManifest)> FetchLatestAsync(IEnumerable<Uri> urls)
    {
        Exception? lastError = null;
        (Uri Uri, UpdateManifest Manifest, Version Version)? latest = null;
        foreach (var uri in urls)
        {
            try
            {
                using var response = await Client.GetAsync(uri);
                response.EnsureSuccessStatusCode();
                var json = await response.Content.ReadAsStringAsync();
                var manifest = JsonSerializer.Deserialize<UpdateManifest>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                    ?? throw new InvalidDataException("更新清单为空");
                if (!Version.TryParse(manifest.Version, out var version)) throw new InvalidDataException("更新版本号无效");
                if (latest is null || version > latest.Value.Version) latest = (uri, manifest, version);
            }
            catch (Exception error) { lastError = error; }
        }
        if (latest is not null) return (latest.Value.Uri, latest.Value.Manifest);
        throw lastError ?? new HttpRequestException("没有可用的更新通道");
    }

    private static async Task<bool> DownloadAndInstallAsync(Window owner, Uri manifestUri, UpdateManifest manifest)
    {
        if (string.IsNullOrWhiteSpace(manifest.PackageUrl) || string.IsNullOrWhiteSpace(manifest.Sha256))
            throw new InvalidDataException("更新清单缺少必要字段");
        var packageUri = new Uri(manifestUri, manifest.PackageUrl);
        if (packageUri.Scheme != Uri.UriSchemeHttps) throw new InvalidDataException("更新包必须使用 HTTPS");
        owner.Title = $"生词助手 · 正在下载 {manifest.Version}";
        var updateRoot = Path.Combine(Path.GetTempPath(), $"word-assistant-update-{Guid.NewGuid():N}");
        var archivePath = Path.Combine(updateRoot, "update.zip");
        var sourcePath = Path.Combine(updateRoot, "package");
        Directory.CreateDirectory(sourcePath);
        try
        {
            using (var response = await Client.GetAsync(packageUri, HttpCompletionOption.ResponseHeadersRead))
            {
                response.EnsureSuccessStatusCode();
                await using var input = await response.Content.ReadAsStreamAsync();
                await using var output = File.Create(archivePath);
                await input.CopyToAsync(output);
            }
            await using var archiveStream = File.OpenRead(archivePath);
            var hash = Convert.ToHexString(await SHA256.HashDataAsync(archiveStream)).ToLowerInvariant();
            if (!hash.Equals(manifest.Sha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("更新包校验失败");
            ExtractSafely(archivePath, sourcePath);
            var executableName = Path.GetFileName(Environment.ProcessPath) ?? "生词助手.exe";
            if (!File.Exists(Path.Combine(sourcePath, executableName))) throw new InvalidDataException($"更新包中缺少 {executableName}");
            LaunchUpdateHelper(updateRoot, sourcePath);
            Application.Current.Shutdown();
            return true;
        }
        catch
        {
            owner.Title = "生词助手";
            MessageBox.Show(owner, "桌面更新包下载、校验或解压失败，请稍后重试。", "更新失败", MessageBoxButton.OK, MessageBoxImage.Warning);
            return false;
        }
    }

    private static void ExtractSafely(string archivePath, string destination)
    {
        using var archive = ZipFile.OpenRead(archivePath);
        var root = Path.GetFullPath(destination) + Path.DirectorySeparatorChar;
        foreach (var entry in archive.Entries)
        {
            var target = Path.GetFullPath(Path.Combine(destination, entry.FullName));
            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("更新包路径无效");
        }
        archive.ExtractToDirectory(destination, true);
    }

    private static void LaunchUpdateHelper(string updateRoot, string sourcePath)
    {
        var scriptPath = Path.Combine(updateRoot, "apply-update.ps1");
        File.WriteAllText(scriptPath, """
param([int]$ProcessId, [string]$Source, [string]$Target, [string]$Executable)
$ErrorActionPreference = 'Stop'
try { Get-Process -Id $ProcessId -ErrorAction Stop | Wait-Process } catch { }
Start-Sleep -Milliseconds 500
Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Target -Recurse -Force
}
Start-Process -FilePath $Executable
""");
        var target = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        var executable = Environment.ProcessPath ?? Path.Combine(target, "生词助手.exe");
        var start = new ProcessStartInfo("powershell.exe") { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden };
        foreach (var argument in new[] { "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
                     "-ProcessId", Environment.ProcessId.ToString(), "-Source", sourcePath, "-Target", target, "-Executable", executable })
            start.ArgumentList.Add(argument);
        Process.Start(start);
    }

    private static string CurrentVersion()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0);
        return version.ToString(3);
    }

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("WordAssistant-Windows-Updater");
        return client;
    }

    private sealed class UpdateManifest
    {
        public string Version { get; set; } = "";
        public string PackageUrl { get; set; } = "";
        public string Sha256 { get; set; } = "";
        public string Notes { get; set; } = "包含体验改进和问题修复。";
    }
}
