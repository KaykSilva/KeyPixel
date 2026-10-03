# 👾 KeyPixel

Plataforma completa para gerenciar, converter e enviar **vídeos, imagens e GIFs** para a **ESP32-C3** com display IPS **ST7789 (240×240)** via Wi-Fi.

---

## 📐 Pinagem de Hardware (ESP32-C3 DevKitM-1)

| Pino ST7789 | Pino ESP32-C3 | Função |
| :--- | :--- | :--- |
| **GND** | GND | Terra |
| **VCC** | 3.3V / 5V | Alimentação |
| **SCL / SCLK** | **GPIO 6** | SPI Clock |
| **SDA / MOSI** | **GPIO 7** | SPI Data (MOSI) |
| **RES / RST** | **GPIO 4** | Reset do Display |
| **DC** | **GPIO 3** | Data / Command |
| **CS** | **GPIO 10** | Chip Select |
| **BLK** | 3.3V / Vin | Backlight (iluminação) |

---

## ⚡ Estrutura do Projeto

- `src/main.cpp`: Firmware da ESP32 com Wi-Fi (Station + fallback SoftAP `KeyPixel-AP`), servidor HTTP REST, mDNS (`http://keypixel.local`), decodificador `AnimatedGIF` e sistema de arquivos `LittleFS`.
- `partitions.csv`: Tabela de partição otimizada que expande o LittleFS para **~2.7 MB** de armazenamento livre na flash de 4MB.
- `web/`: **KeyPixel Studio** — Aplicação web moderna com transcodificador integrado no navegador (converte vídeos MP4/WebM e fotos para GIFs 240x240 sem precisar de backend).
- `data/`: Armazenamento de arquivos padrão do LittleFS (ex: `anime.gif`).

---

## 🚀 Como Executar

### 1. Iniciar o Painel Web (KeyPixel Studio)

No terminal do projeto:

```bash
npm run dev
```

Abra o navegador em: [http://localhost:5173](http://localhost:5173)

### 2. Compilar e Gravar o Firmware na ESP32

Para compilar e enviar o código para a placa via cabo USB:

```bash
npm run esp:upload
```

*(Ou diretamente com PlatformIO: `~/.platformio/penv/bin/pio run -t upload`)*

Para enviar os arquivos iniciais da pasta `data/` para o LittleFS da ESP32:

```bash
npm run esp:uploadfs
```

Para monitorar os logs seriais (115200 baud):

```bash
npm run esp:monitor
```

---

## 🌐 Conexão Wi-Fi da ESP32

Ao ligar a ESP32:
1. **Rede Salva**: Se você já configurou seu Wi-Fi pelo painel, ela se conectará automaticamente e exibirá o IP no display.
2. **Modo Access Point (SoftAP)**: Se não houver rede salva ou o Wi-Fi estiver fora do alcance, a placa criará uma rede própria:
   - **Nome (SSID):** `KeyPixel-AP`
   - **Senha:** `12345678`
   - **IP:** `192.168.4.1`
3. **mDNS**: Em qualquer rede, você pode acessá-la diretamente por [http://keypixel.local](http://keypixel.local).

---

## 🎬 Funcionalidades do KeyPixel Studio

1. **Simulador Hardware ST7789**:
   - Réplica visual do display 240×240 em tempo real na interface, com efeito CRT/scanlines opcional e status da ESP32.
2. **Vídeo para GIF (Client-side)**:
   - Suporte a MP4, WebM e MOV.
   - Régua de corte de trecho (timeline trimmer).
   - Seletor de FPS (6 a 24 fps) e quantização de paleta (64 a 256 cores) para gerar arquivos leves e fluidos.
   - Enquadramento automático para 240×240 (Cover 1:1, Letterbox ou Stretch).
3. **Imagens para 240×240**:
   - Ajuste de zoom, contraste e filtro opcional de Pixel Art retrô.
4. **Otimizador de GIFs Pesados (>1MB)**:
   - **Por que GIFs de 1MB travam?** A ESP32-C3 possui apenas ~100KB de RAM livre e o decodificador `AnimatedGIF` aloca buffers baseados na resolução original da imagem. Se um GIF tiver 480x480, 800x600 ou dezenas de frames pesados, a memória esgota e o display não consegue abrir.
   - **Solução no Navegador:** Basta arrastar o GIF para a aba **"GIF Direto"** no KeyPixel Studio. O painel detecta as dimensões, avisa sobre incompatibilidade e permite:
     - Cortar e redimensionar para exatamente **240×240** (Cover 1:1 ou Contain).
     - Reduzir frames (pular 1 a cada 2 frames corta 50% do peso mantendo a fluidez).
     - Reduzir paleta para 64 ou 128 cores.
     - Reduzir um GIF de 1MB–3MB para **~50KB–150KB** com 1 clique!
   - **Solução via Linha de Comando (Terminal):**
     ```bash
     # Converte qualquer GIF pesado para 240x240 otimizado
     npm run gif:optimize -- data/meu_gif_pesado.gif
     ```
5. **Gerenciador de Memória & Galeria da ESP32**:
   - Barra de uso de armazenamento LittleFS (usado vs livre).
   - Galeria com todos os GIFs salvos na memória da placa.
   - Botões para **Reproduzir Agora**, **Excluir** e **Baixar**.

---

## 📡 Endpoints da API REST na ESP32

Todas as rotas suportam CORS (`Access-Control-Allow-Origin: *`):

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/status` | Retorna status da placa, IP, modo Wi-Fi, sinal RSSI e espaço livre no LittleFS |
| `GET` | `/api/files` | Lista todos os arquivos armazenados e qual está em exibição |
| `POST` | `/api/upload` | Envio em streaming de arquivos multipart/form-data direto para a flash |
| `POST` | `/api/play` | Define o arquivo ativo no display (`{"file":"nome.gif"}`) |
| `POST` | `/api/delete` | Exclui um arquivo da flash (`{"file":"nome.gif"}`) |
| `POST` | `/api/wifi` | Grava credenciais Wi-Fi na NVS e reconecta (`{"ssid":"...","password":"..."}`) |
| `GET` | `/files/{nome}` | Serve o arquivo da flash para exibição/download no navegador |
