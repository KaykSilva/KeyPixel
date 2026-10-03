#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <SPI.h>
#include <LittleFS.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <AnimatedGIF.h>
#include <ArduinoJson.h>

// ST7789 Pinout for ESP32-C3 DevKitM-1
#define TFT_CS    10
#define TFT_DC    3
#define TFT_RST   4
#define TFT_SCLK  6
#define TFT_MOSI  7
#define TFT_WIDTH 240
#define TFT_HEIGHT 240

Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_RST);
AnimatedGIF gif;
File gifFile;
File uploadFile;
WebServer server(80);
Preferences prefs;

bool gifLoaded = false;
String currentGifPath = "/anime.gif";
unsigned long lastFrameTime = 0;
int currentFrameDelay = 50;
bool isUploading = false;
unsigned long bootSplashUntil = 0;

// GIF callbacks for LittleFS
void *GIFOpenFile(const char *filename, int32_t *fileSize)
{
    gifFile = LittleFS.open(filename, "r");
    if (!gifFile) {
        *fileSize = 0;
        return nullptr;
    }
    *fileSize = gifFile.size();
    return &gifFile;
}

void GIFCloseFile(void *handle)
{
    if (handle) {
        static_cast<File *>(handle)->close();
    }
}

int32_t GIFReadFile(GIFFILE *file, uint8_t *buffer, int32_t length)
{
    File *handle = static_cast<File *>(file->fHandle);
    if (!handle) {
        return 0;
    }

    const int32_t bytesAvailable = file->iSize - file->iPos;
    const int32_t bytesToRead = min(length, max<int32_t>(0, bytesAvailable));
    if (bytesToRead == 0) {
        return 0;
    }

    const int32_t bytesRead = handle->read(buffer, bytesToRead);
    file->iPos = handle->position();
    return bytesRead;
}

int32_t GIFSeekFile(GIFFILE *file, int32_t position)
{
    File *handle = static_cast<File *>(file->fHandle);
    if (!handle || !handle->seek(position)) {
        return -1;
    }

    file->iPos = handle->position();
    return file->iPos;
}

void GIFDraw(GIFDRAW *draw)
{
    const int16_t x = (TFT_WIDTH - draw->iWidth) / 2 + draw->iX;
    const int16_t y = (TFT_HEIGHT - draw->iHeight) / 2 + draw->iY + draw->y;
    if (y < 0 || y >= TFT_HEIGHT || x >= TFT_WIDTH || x + draw->iWidth <= 0) {
        return;
    }

    uint16_t line[TFT_WIDTH] = {};
    const uint16_t *palette = draw->pPalette;
    const uint8_t *pixels = draw->pPixels;

    for (int16_t i = 0; i < draw->iWidth; ++i) {
        const int16_t screenX = x + i;
        if (screenX >= 0 && screenX < TFT_WIDTH) {
            line[screenX] = (draw->ucHasTransparency && pixels[i] == draw->ucTransparent)
                                ? ST77XX_BLACK
                                : palette[pixels[i]];
        }
    }

    const int16_t left = max<int16_t>(0, x);
    const int16_t right = min<int16_t>(TFT_WIDTH, x + draw->iWidth);
    tft.drawRGBBitmap(left, y, line + left, right - left, 1);
}

void stopGif()
{
    if (gifLoaded) {
        gif.close();
        gifLoaded = false;
    }
}

bool openGif(const char *path)
{
    stopGif();
    if (!LittleFS.exists(path)) {
        Serial.printf("[GIF] Arquivo %s nao encontrado.\n", path);
        return false;
    }

    tft.fillScreen(ST77XX_BLACK);
    gif.begin(LITTLE_ENDIAN_PIXELS);
    gif.setDrawType(GIF_DRAW_RAW);

    gifLoaded = gif.open(path, GIFOpenFile, GIFCloseFile, GIFReadFile, GIFSeekFile, GIFDraw);
    if (gifLoaded) {
        currentGifPath = String(path);
        lastFrameTime = 0;
        currentFrameDelay = 20;
        Serial.printf("[GIF] Aberto com sucesso: %s\n", path);
    } else {
        Serial.printf("[GIF] Erro ao decodificar %s\n", path);
    }
    return gifLoaded;
}

// Display visual helper
void drawStatusScreen(const String &title, const String &line1, const String &line2, const String &line3)
{
    tft.fillScreen(ST77XX_BLACK);
    tft.drawRect(4, 4, TFT_WIDTH - 8, TFT_HEIGHT - 8, 0x07E0); // Bright green border
    tft.drawRect(6, 6, TFT_WIDTH - 12, TFT_HEIGHT - 12, 0x03E0);

    tft.setTextColor(0x07FF); // Cyan
    tft.setTextSize(2);
    tft.setCursor(20, 25);
    tft.print(title);

    tft.drawFastHLine(15, 52, TFT_WIDTH - 30, 0x07FF);

    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(1);

    tft.setCursor(18, 70);
    tft.print(line1);

    tft.setCursor(18, 95);
    tft.print(line2);

    tft.setTextColor(0xFD20); // Orange/Gold
    tft.setCursor(18, 125);
    tft.print(line3);

    tft.setTextColor(0x7BEF); // Gray
    tft.setCursor(18, 180);
    tft.print("KeyPixel Studio Ready");
    tft.setCursor(18, 195);
    tft.print("Envie midias pelo app!");
}

// CORS Helper
void setCorsHeaders()
{
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
}

void handleOptions()
{
    setCorsHeaders();
    server.send(204);
}

// API: Status
void handleApiStatus()
{
    setCorsHeaders();
    JsonDocument doc;

    doc["device"] = "KeyPixel ESP32-C3";
    doc["version"] = "1.0.0";
    doc["display"]["width"] = TFT_WIDTH;
    doc["display"]["height"] = TFT_HEIGHT;

    JsonObject wifiObj = doc["wifi"].to<JsonObject>();
    wifiObj["mode"] = (WiFi.getMode() == WIFI_AP) ? "AP" : "STA";
    wifiObj["connected"] = (WiFi.status() == WL_CONNECTED || WiFi.getMode() == WIFI_AP);
    wifiObj["ssid"] = (WiFi.getMode() == WIFI_AP) ? "KeyPixel-AP" : WiFi.SSID();
    wifiObj["ip"] = (WiFi.getMode() == WIFI_AP) ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
    wifiObj["rssi"] = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;

    JsonObject storageObj = doc["storage"].to<JsonObject>();
    size_t total = LittleFS.totalBytes();
    size_t used = LittleFS.usedBytes();
    storageObj["total"] = total;
    storageObj["used"] = used;
    storageObj["free"] = (total > used) ? (total - used) : 0;

    doc["currentFile"] = currentGifPath;
    doc["isPlaying"] = gifLoaded;

    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
}

// API: List Files
void handleApiFiles()
{
    setCorsHeaders();
    JsonDocument doc;
    JsonArray filesArray = doc["files"].to<JsonArray>();

    File root = LittleFS.open("/");
    if (root && root.isDirectory()) {
        File file = root.openNextFile();
        while (file) {
            String name = file.name();
            if (!name.startsWith("/")) {
                name = "/" + name;
            }
            // Filter system or hidden files if needed
            if (!name.startsWith("/.")) {
                JsonObject f = filesArray.add<JsonObject>();
                f["name"] = name.substring(1);
                f["path"] = name;
                f["size"] = file.size();
                f["isCurrent"] = (name == currentGifPath);
            }
            file = root.openNextFile();
        }
    }

    doc["current"] = currentGifPath;
    doc["totalBytes"] = LittleFS.totalBytes();
    doc["usedBytes"] = LittleFS.usedBytes();

    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
}

// API: Play File
void handleApiPlay()
{
    setCorsHeaders();
    String target = "";

    if (server.hasArg("plain")) {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (!err && doc["file"].is<const char *>()) {
            target = doc["file"].as<String>();
        }
    } else if (server.hasArg("file")) {
        target = server.arg("file");
    }

    if (target.length() == 0) {
        server.send(400, "application/json", "{\"error\":\"Parametro 'file' ausente\"}");
        return;
    }

    if (!target.startsWith("/")) {
        target = "/" + target;
    }

    if (!LittleFS.exists(target)) {
        server.send(404, "application/json", "{\"error\":\"Arquivo nao encontrado no LittleFS\"}");
        return;
    }

    stopGif();
    bootSplashUntil = 0; // stop splash screen
    bool ok = openGif(target.c_str());

    if (ok) {
        prefs.putString("currentGif", target);
        server.send(200, "application/json", "{\"success\":true,\"current\":\"" + target + "\"}");
    } else {
        server.send(500, "application/json", "{\"error\":\"Nao foi possivel abrir o arquivo GIF\"}");
    }
}

// API: Delete File
void handleApiDelete()
{
    setCorsHeaders();
    String target = "";

    if (server.hasArg("plain")) {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (!err && doc["file"].is<const char *>()) {
            target = doc["file"].as<String>();
        }
    } else if (server.hasArg("file")) {
        target = server.arg("file");
    }

    if (target.length() == 0) {
        server.send(400, "application/json", "{\"error\":\"Parametro 'file' ausente\"}");
        return;
    }

    if (!target.startsWith("/")) {
        target = "/" + target;
    }

    if (!LittleFS.exists(target)) {
        server.send(404, "application/json", "{\"error\":\"Arquivo nao encontrado\"}");
        return;
    }

    if (currentGifPath == target) {
        stopGif();
    }

    bool ok = LittleFS.remove(target);
    if (ok) {
        // If deleted file was current, find next GIF or anime.gif
        if (currentGifPath == target) {
            if (LittleFS.exists("/anime.gif")) {
                openGif("/anime.gif");
            } else {
                File root = LittleFS.open("/");
                File next = root.openNextFile();
                bool found = false;
                while (next) {
                    String n = next.name();
                    if (!n.startsWith("/")) n = "/" + n;
                    if (n.endsWith(".gif")) {
                        openGif(n.c_str());
                        found = true;
                        break;
                    }
                    next = root.openNextFile();
                }
                if (!found) {
                    drawStatusScreen("KeyPixel", "Nenhum GIF na memoria", "Acesse o painel web", "para enviar midias.");
                }
            }
        }
        server.send(200, "application/json", "{\"success\":true}");
    } else {
        server.send(500, "application/json", "{\"error\":\"Falha ao excluir arquivo\"}");
    }
}

// API: Download/Serve File directly from LittleFS
void handleFileDownload()
{
    setCorsHeaders();
    String path = server.uri();
    if (path.startsWith("/files/")) {
        path = "/" + path.substring(7);
    } else if (server.hasArg("file")) {
        path = server.arg("file");
        if (!path.startsWith("/")) path = "/" + path;
    }

    if (!LittleFS.exists(path)) {
        server.send(404, "text/plain", "Arquivo nao encontrado");
        return;
    }

    File file = LittleFS.open(path, "r");
    String contentType = "application/octet-stream";
    if (path.endsWith(".gif")) contentType = "image/gif";
    else if (path.endsWith(".png")) contentType = "image/png";
    else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) contentType = "image/jpeg";
    else if (path.endsWith(".json")) contentType = "application/json";

    server.streamFile(file, contentType);
    file.close();
}

// API: Upload Handler
void handleUploadProgress()
{
    HTTPUpload &upload = server.upload();

    if (upload.status == UPLOAD_FILE_START) {
        isUploading = true;
        stopGif();

        String filename = upload.filename;
        if (!filename.startsWith("/")) {
            filename = "/" + filename;
        }

        // Clean filename (keep only alphanumeric, dash, underscore, dot)
        String cleanName = "";
        for (size_t i = 0; i < filename.length(); i++) {
            char c = filename[i];
            if (isalnum(c) || c == '.' || c == '_' || c == '-' || c == '/') {
                cleanName += c;
            } else {
                cleanName += '_';
            }
        }

        Serial.printf("[Upload] Iniciando: %s\n", cleanName.c_str());

        // Show upload notification on screen
        drawStatusScreen("RECEBENDO MIDIA", "Arquivo:", cleanName.substring(1), "Transferindo dados...");

        uploadFile = LittleFS.open(cleanName, "w");
        if (!uploadFile) {
            Serial.printf("[Upload] Falha ao abrir %s para escrita!\n", cleanName.c_str());
        }
    } else if (upload.status == UPLOAD_FILE_WRITE) {
        if (uploadFile) {
            uploadFile.write(upload.buf, upload.currentSize);
        }
    } else if (upload.status == UPLOAD_FILE_END) {
        if (uploadFile) {
            uploadFile.close();
            Serial.printf("[Upload] Concluido! Tamanho total: %u bytes\n", upload.totalSize);
        }
        isUploading = false;
    } else if (upload.status == UPLOAD_FILE_ABORTED) {
        if (uploadFile) {
            uploadFile.close();
        }
        isUploading = false;
        Serial.println("[Upload] Abortado pelo cliente");
    }
}

void handleUploadDone()
{
    setCorsHeaders();
    HTTPUpload &upload = server.upload();
    String filename = upload.filename;
    if (!filename.startsWith("/")) {
        filename = "/" + filename;
    }

    if (uploadFile) {
        uploadFile.close();
    }
    isUploading = false;

    // Immediately play the uploaded file if it's a GIF
    if (LittleFS.exists(filename)) {
        prefs.putString("currentGif", filename);
        bootSplashUntil = 0;
        openGif(filename.c_str());

        JsonDocument doc;
        doc["success"] = true;
        doc["file"] = filename;
        doc["size"] = upload.totalSize;
        String resp;
        serializeJson(doc, resp);
        server.send(200, "application/json", resp);
    } else {
        server.send(500, "application/json", "{\"error\":\"Arquivo nao salvo corretamente\"}");
    }
}

// API: Configure WiFi
void handleApiWifi()
{
    setCorsHeaders();
    if (!server.hasArg("plain")) {
        server.send(400, "application/json", "{\"error\":\"JSON body esperado\"}");
        return;
    }

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (err) {
        server.send(400, "application/json", "{\"error\":\"JSON invalido\"}");
        return;
    }

    String ssid = doc["ssid"].as<String>();
    String pass = doc["password"].as<String>();

    if (ssid.length() == 0) {
        server.send(400, "application/json", "{\"error\":\"SSID nao pode ser vazio\"}");
        return;
    }

    prefs.putString("wifi_ssid", ssid);
    prefs.putString("wifi_pass", pass);

    server.send(200, "application/json", "{\"success\":true,\"message\":\"Configuracoes salvas. Reiniciando WiFi...\"}");
    delay(500);

    WiFi.disconnect(true);
    WiFi.begin(ssid.c_str(), pass.c_str());
}

// Root page fallback
void handleRoot()
{
    setCorsHeaders();
    String html = "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1.0'>"
                  "<title>KeyPixel ESP32</title>"
                  "<style>body{background:#0d1117;color:#e6edf3;font-family:sans-serif;padding:2rem;text-align:center;}"
                  "h1{color:#38bdf8;}a.btn{display:inline-block;margin-top:1rem;padding:0.75rem 1.5rem;background:#0284c7;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;}"
                  "p{line-height:1.6;color:#94a3b8;}</style></head><body>"
                  "<h1>&#x1F47E; KeyPixel ESP32-C3 Online!</h1>"
                  "<p>Dispositivo conectado com sucesso e pronto para receber m&iacute;dias (GIFs, v&iacute;deos e imagens).</p>"
                  "<p>IP Atual: <strong>" + (WiFi.getMode() == WIFI_AP ? WiFi.softAPIP().toString() : WiFi.localIP().toString()) + "</strong></p>"
                  "<p>Abra o <strong>KeyPixel Studio</strong> no seu navegador para gerenciar, converter e enviar novas anima&ccedil;&otilde;es!</p>"
                  "</body></html>";
    server.send(200, "text/html", html);
}

void setup()
{
    Serial.begin(115200);
    delay(400);
    Serial.println("\n--- [KeyPixel ESP32-C3 Inicializando] ---");

    // Init SPI and ST7789 Display
    SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
    tft.init(TFT_WIDTH, TFT_HEIGHT);
    tft.setRotation(0);
    tft.fillScreen(ST77XX_BLACK);

    // Initial LittleFS Mount
    if (!LittleFS.begin(true)) {
        Serial.println("[LittleFS] Falha critica ao montar LittleFS!");
        drawStatusScreen("ERRO", "Falha ao montar LittleFS", "Verifique particao flash", "Pressione RST");
        while (true) {
            delay(1000);
        }
    }
    Serial.printf("[LittleFS] Montado. Espaco: %u / %u bytes usados\n", LittleFS.usedBytes(), LittleFS.totalBytes());

    // Load preferences
    prefs.begin("keypixel", false);
    String savedGif = prefs.getString("currentGif", "/anime.gif");
    String savedSsid = prefs.getString("wifi_ssid", "");
    String savedPass = prefs.getString("wifi_pass", "");

    // WiFi Setup
    drawStatusScreen("KEYPIXEL", "Iniciando Wi-Fi...", savedSsid.length() > 0 ? "SSID: " + savedSsid : "Sem rede salva", "Aguarde...");

    WiFi.mode(WIFI_STA);
    bool wifiConnected = false;

    if (savedSsid.length() > 0) {
        Serial.printf("[WiFi] Conectando a %s...\n", savedSsid.c_str());
        WiFi.begin(savedSsid.c_str(), savedPass.c_str());

        int retries = 0;
        while (WiFi.status() != WL_CONNECTED && retries < 25) {
            delay(300);
            Serial.print(".");
            retries++;
        }
        Serial.println();
        wifiConnected = (WiFi.status() == WL_CONNECTED);
    }

    if (wifiConnected) {
        String ipStr = WiFi.localIP().toString();
        Serial.printf("[WiFi] Conectado! IP: %s\n", ipStr.c_str());
        drawStatusScreen("KEYPIXEL", "Wi-Fi: CONECTADO", "IP: " + ipStr, "http://keypixel.local");
    } else {
        Serial.println("[WiFi] Nao foi possivel conectar como Station. Iniciando SoftAP...");
        WiFi.mode(WIFI_AP);
        WiFi.softAP("KeyPixel-AP", "12345678");
        String apIp = WiFi.softAPIP().toString();
        Serial.printf("[WiFi] Access Point ativo: KeyPixel-AP (IP: %s)\n", apIp.c_str());
        drawStatusScreen("KEYPIXEL", "Rede: KeyPixel-AP", "Senha:  12345678", "IP: " + apIp);
    }

    // Start mDNS responder
    if (MDNS.begin("keypixel")) {
        MDNS.addService("http", "tcp", 80);
        Serial.println("[mDNS] Responder keypixel.local iniciado!");
    }

    // Setup WebServer Endpoints
    server.on("/", HTTP_GET, handleRoot);
    server.on("/api/status", HTTP_GET, handleApiStatus);
    server.on("/api/files", HTTP_GET, handleApiFiles);
    server.on("/api/play", HTTP_POST, handleApiPlay);
    server.on("/api/delete", HTTP_POST, handleApiDelete);
    server.on("/api/wifi", HTTP_POST, handleApiWifi);
    server.on("/files/{filename}", HTTP_GET, handleFileDownload);

    // File upload endpoint with streaming handler
    server.on("/api/upload", HTTP_POST, handleUploadDone, handleUploadProgress);

    // CORS OPTIONS preflight
    server.on("/api/status", HTTP_OPTIONS, handleOptions);
    server.on("/api/files", HTTP_OPTIONS, handleOptions);
    server.on("/api/play", HTTP_OPTIONS, handleOptions);
    server.on("/api/delete", HTTP_OPTIONS, handleOptions);
    server.on("/api/wifi", HTTP_OPTIONS, handleOptions);
    server.on("/api/upload", HTTP_OPTIONS, handleOptions);

    server.begin();
    Serial.println("[Server] Servidor HTTP iniciado na porta 80");

    // Show boot splash for 2.5 seconds, then load the default or saved GIF
    bootSplashUntil = millis() + 2500;
    currentGifPath = savedGif;
}

void loop()
{
    // Handle incoming web requests
    server.handleClient();

    // If uploading, pause playback so flash writes are not interrupted
    if (isUploading) {
        delay(5);
        return;
    }

    // Keep boot screen visible for initial 2.5s
    if (bootSplashUntil > 0) {
        if (millis() < bootSplashUntil) {
            delay(10);
            return;
        } else {
            bootSplashUntil = 0;
            // Attempt to open saved GIF or anime.gif
            if (!openGif(currentGifPath.c_str())) {
                if (LittleFS.exists("/anime.gif")) {
                    openGif("/anime.gif");
                }
            }
        }
    }

    // Non-blocking GIF playback frame by frame
    if (gifLoaded) {
        unsigned long now = millis();
        if (now - lastFrameTime >= (unsigned long)currentFrameDelay) {
            int frameDelay = 50;
            // playFrame with bSync=false decodes 1 frame and returns immediately
            int res = gif.playFrame(false, &frameDelay);
            if (res <= 0) {
                // Loop: restart GIF from beginning
                gif.close();
                gifLoaded = gif.open(currentGifPath.c_str(), GIFOpenFile, GIFCloseFile, GIFReadFile, GIFSeekFile, GIFDraw);
            }
            if (frameDelay < 15) {
                frameDelay = 15; // Cap minimum frame delay to prevent starving CPU
            }
            currentFrameDelay = frameDelay;
            lastFrameTime = millis();
        }
    } else {
        delay(20);
    }
}
