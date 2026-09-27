using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Forms = System.Windows.Forms;

namespace Cet6WordAssistant;

public partial class MainWindow : Window
{
    private static readonly HttpClient AudioClient = CreateAudioClient();

    private sealed class DesktopSettings
    {
        public string? CachePath { get; set; }
    }

    private readonly string settingsDirectory = FindPortableDataDirectory();
    private string cachePath = "";

    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await InitializeBrowser();
    }

    private async Task InitializeBrowser()
    {
        try
        {
            Directory.CreateDirectory(settingsDirectory);
            var userData = Path.Combine(settingsDirectory, "WebView2");
            var configuredCachePath = LoadSettings().CachePath;
            cachePath = !string.IsNullOrWhiteSpace(configuredCachePath) && !IsSystemDrive(configuredCachePath)
                ? Path.GetFullPath(configuredCachePath)
                : Path.Combine(settingsDirectory, "Cache");
            Directory.CreateDirectory(userData);
            Directory.CreateDirectory(cachePath);
            var options = new CoreWebView2EnvironmentOptions
            {
                AdditionalBrowserArguments = $"--disk-cache-dir=\"{cachePath}\""
            };
            var environment = await CoreWebView2Environment.CreateAsync(null, userData, options);
            await Browser.EnsureCoreWebView2Async(environment);

            // Refresh packaged UI files after an update without touching the
            // user's IndexedDB/localStorage vocabulary data.
            await Browser.CoreWebView2.Profile.ClearBrowsingDataAsync(
                CoreWebView2BrowsingDataKinds.DiskCache |
                CoreWebView2BrowsingDataKinds.CacheStorage |
                CoreWebView2BrowsingDataKinds.ServiceWorkers);

            var webRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            if (!File.Exists(Path.Combine(webRoot, "index.html")))
                throw new FileNotFoundException("应用资源不完整，请重新安装。", Path.Combine(webRoot, "index.html"));

            Browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "app.cet6.local",
                webRoot,
                CoreWebView2HostResourceAccessKind.Allow);
            Browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
            Browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            Browser.CoreWebView2.WebMessageReceived += HandleWebMessage;
            Browser.CoreWebView2.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true });
            };
            Browser.NavigationCompleted += (_, args) =>
            {
                if (!args.IsSuccess) return;
                LoadingPanel.Visibility = Visibility.Collapsed;
                Browser.Visibility = Visibility.Visible;
            };
            Browser.Source = new Uri("https://app.cet6.local/index.html");
        }
        catch (Exception error)
        {
            System.Windows.MessageBox.Show(error.Message, "生词助手无法启动", MessageBoxButton.OK, MessageBoxImage.Error);
            Close();
        }
    }

    private DesktopSettings LoadSettings()
    {
        var path = Path.Combine(settingsDirectory, "desktop-settings.json");
        try
        {
            return File.Exists(path)
                ? JsonSerializer.Deserialize<DesktopSettings>(File.ReadAllText(path)) ?? new DesktopSettings()
                : new DesktopSettings();
        }
        catch
        {
            return new DesktopSettings();
        }
    }

    private void SaveSettings(DesktopSettings settings)
    {
        Directory.CreateDirectory(settingsDirectory);
        File.WriteAllText(
            Path.Combine(settingsDirectory, "desktop-settings.json"),
            JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
    }

    private async void HandleWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        try
        {
            using var document = JsonDocument.Parse(args.WebMessageAsJson);
            var root = document.RootElement;
            var id = root.TryGetProperty("id", out var idElement) ? idElement.GetString() : null;
            var action = root.TryGetProperty("action", out var actionElement) ? actionElement.GetString() : null;
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(action)) return;

            if (action == "getCachePath")
            {
                Reply(id, new { cachePath, restartRequired = false });
                return;
            }

            if (action == "chooseCachePath")
            {
                using var dialog = new Forms.FolderBrowserDialog
                {
                    Description = "选择生词助手的缓存文件夹",
                    SelectedPath = cachePath,
                    ShowNewFolderButton = true,
                    UseDescriptionForTitle = true,
                };
                if (dialog.ShowDialog() != Forms.DialogResult.OK)
                {
                    Reply(id, new { cancelled = true, cachePath, restartRequired = false });
                    return;
                }

                var selected = Path.GetFullPath(dialog.SelectedPath);
                if (IsSystemDrive(selected))
                {
                    Reply(id, new { error = "缓存位置不能选择 C 盘，请选择项目所在的 D 盘或其他非系统盘。" });
                    return;
                }
                Directory.CreateDirectory(selected);
                cachePath = selected;
                SaveSettings(new DesktopSettings { CachePath = cachePath });
                Reply(id, new { cachePath, restartRequired = true });
                return;
            }

            if (action == "fetchEnglishAudio")
            {
                var text = root.TryGetProperty("text", out var textElement) ? textElement.GetString()?.Trim() : null;
                if (string.IsNullOrWhiteSpace(text) || text.Length > 500 ||
                    !Regex.IsMatch(text, @"[A-Za-z]") ||
                    !Regex.IsMatch(text, @"^[\p{IsBasicLatin}\u2018\u2019\u201C\u201D\u2013\u2014\u2026]+$") ||
                    Regex.IsMatch(text, @"[\x00-\x1F\x7F]"))
                {
                    Reply(id, new { error = "英文语音文本无效。" });
                    return;
                }

                var rate = root.TryGetProperty("rate", out var rateElement) && rateElement.TryGetDouble(out var requestedRate)
                    ? Math.Clamp(requestedRate, 0.5, 2)
                    : 1;
                var spelling = root.TryGetProperty("spelling", out var spellingElement) && spellingElement.ValueKind == JsonValueKind.True;
                var speed = rate <= 0.5 ? 1 : rate <= 0.6 ? 2 : rate <= 0.7 ? 3 : rate <= 0.85 ? 4 : rate <= 1 ? 5 : rate <= 1.1 ? 6 : 7;
                var encodedText = Uri.EscapeDataString(text);
                var googleUrl = $"https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q={encodedText}";
                var urls = spelling
                    ? new[] { googleUrl }
                    : new[]
                    {
                        $"https://fanyi.baidu.com/gettts?lan=en&text={encodedText}&spd={speed}&source=web",
                        googleUrl,
                    };
                foreach (var url in urls)
                {
                    try
                    {
                        using var response = await AudioClient.GetAsync(url);
                        if (!response.IsSuccessStatusCode) continue;
                        var bytes = await response.Content.ReadAsByteArrayAsync();
                        var mediaType = response.Content.Headers.ContentType?.MediaType ?? "";
                        if (bytes.Length < 256 || bytes.Length > 1_000_000 ||
                            !mediaType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase)) continue;
                        Reply(id, new { audioDataUrl = $"data:{mediaType};base64,{Convert.ToBase64String(bytes)}" });
                        return;
                    }
                    catch (HttpRequestException) { }
                    catch (TaskCanceledException) { }
                }
                throw new InvalidDataException("英文语音服务未返回可用音频。");
            }

            if (action == "checkUpdate")
            {
                var manifestUrls = root.TryGetProperty("manifestUrls", out var urlsElement) && urlsElement.ValueKind == JsonValueKind.Array
                    ? urlsElement.EnumerateArray().Select(item => item.GetString() ?? "").Where(value => !string.IsNullOrWhiteSpace(value)).ToArray()
                    : Array.Empty<string>();
                var userInitiated = root.TryGetProperty("userInitiated", out var initiatedElement) && initiatedElement.ValueKind == JsonValueKind.True;
                var result = await DesktopUpdater.CheckAsync(this, manifestUrls, userInitiated);
                Reply(id, new { updateStatus = result.Status, version = result.Version });
                return;
            }

            if (action == "restart")
            {
                var executable = Environment.ProcessPath;
                if (!string.IsNullOrWhiteSpace(executable))
                    Process.Start(new ProcessStartInfo(executable) { UseShellExecute = true });
                System.Windows.Application.Current.Shutdown();
            }
        }
        catch (Exception error)
        {
            try
            {
                using var document = JsonDocument.Parse(args.WebMessageAsJson);
                var id = document.RootElement.TryGetProperty("id", out var idElement) ? idElement.GetString() : null;
                if (!string.IsNullOrWhiteSpace(id)) Reply(id, new { error = error.Message });
            }
            catch { }
        }
    }

    private void Reply(string id, object payload)
    {
        var json = JsonSerializer.Serialize(new { id, payload });
        Browser.CoreWebView2.PostWebMessageAsJson(json);
    }

    private static HttpClient CreateAudioClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 WordAssistant/0.1.1");
        return client;
    }

    private static string FindPortableDataDirectory()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "package.json")) &&
                Directory.Exists(Path.Combine(directory.FullName, "src")))
            {
                var projectData = Path.Combine(directory.FullName, "app-data", "windows");
                if (IsSystemDrive(projectData))
                    throw new InvalidOperationException("项目位于 C 盘。请把项目移动到 D 盘后再启动应用。");
                return projectData;
            }
            directory = directory.Parent;
        }

        var portableData = Path.Combine(AppContext.BaseDirectory, "app-data");
        if (IsSystemDrive(portableData))
            throw new InvalidOperationException("应用位于 C 盘。请把整个应用文件夹移动到 D 盘后再启动。");
        return portableData;
    }

    private static bool IsSystemDrive(string path)
    {
        var systemDrive = Environment.GetEnvironmentVariable("SystemDrive") ?? "C:";
        var root = Path.GetPathRoot(Path.GetFullPath(path))?.TrimEnd('\\');
        return string.Equals(root, systemDrive.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);
    }
}
