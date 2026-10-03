#include <Arduino.h>
#include <SPI.h>
#include <LittleFS.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <AnimatedGIF.h>

#define TFT_CS    10
#define TFT_DC    3
#define TFT_RST   4
#define TFT_SCLK  6
#define TFT_MOSI  7

Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_RST);
AnimatedGIF gif;
File gifFile;
bool gifLoaded = false;

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

    // AnimatedGIF uses GIFFILE::iPos to track the current frame position.
    // Keep it in sync with LittleFS so the decoder can advance and restart
    // the animation correctly.
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
    const int16_t x = (240 - draw->iWidth) / 2 + draw->iX;
    const int16_t y = (240 - draw->iHeight) / 2 + draw->iY + draw->y;
    if (y < 0 || y >= 240 || x >= 240 || x + draw->iWidth <= 0) {
        return;
    }

    uint16_t line[240] = {};
    const uint16_t *palette = draw->pPalette;
    const uint8_t *pixels = draw->pPixels;

    for (int16_t i = 0; i < draw->iWidth; ++i) {
        const int16_t screenX = x + i;
        if (screenX >= 0 && screenX < 240) {
            line[screenX] = draw->ucHasTransparency &&
                                    pixels[i] == draw->ucTransparent
                                ? ST77XX_BLACK
                                : palette[pixels[i]];
        }
    }

    const int16_t left = max<int16_t>(0, x);
    const int16_t right = min<int16_t>(240, x + draw->iWidth);
    tft.drawRGBBitmap(left, y, line + left, right - left, 1);
}

void setup()
{
    Serial.begin(115200);
    delay(500);

    SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
    tft.init(240, 240);
    tft.setRotation(0);
    tft.fillScreen(ST77XX_BLACK);

    if (!LittleFS.begin(true)) {
        Serial.println("Falha ao montar LittleFS!");
        while (true) {
            delay(1000);
        }
    }

    if (!LittleFS.exists("/mew_.gif")) {
        Serial.println("Arquivo /anime.gif nao encontrado no LittleFS.");
        Serial.println("Envie os arquivos da pasta data com: pio run -t uploadfs");
    } else {
        File file = LittleFS.open("/anime.gif", "r");
        Serial.printf("/anime.gif encontrado (%u bytes).\n", file.size());
        file.close();
    }

    gif.begin(LITTLE_ENDIAN_PIXELS);
    gif.setDrawType(GIF_DRAW_RAW);

    gifLoaded = gif.open("/mew_.gif", GIFOpenFile, GIFCloseFile, GIFReadFile,
                         GIFSeekFile, GIFDraw);
    if (!gifLoaded) {
        Serial.println("Nao foi possivel abrir /anime.gif");
    } else {
        Serial.println("GIF aberto!");
    }
}

void loop()
{
    if (!gifLoaded) {
        delay(1000);
        return;
    }

    // With bSync=true, AnimatedGIF waits for the delay encoded in each frame.
    // Passing false here and delaying again makes the animation unnecessarily
    // slow and can make it look frozen on a small display.
    if (!gif.playFrame(true, nullptr)) {
        gif.close();
        gifLoaded = gif.open("/anime.gif", GIFOpenFile, GIFCloseFile,
                             GIFReadFile, GIFSeekFile, GIFDraw);
    }
}
