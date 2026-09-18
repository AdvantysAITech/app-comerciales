/**
 * Conversión de la grabación del navegador a WAV mono 16 kHz.
 *
 * POR QUÉ EXISTE ESTE FICHERO: Gemini admite WAV, MP3, AIFF, AAC, OGG y FLAC.
 * No admite WebM, que es exactamente lo que produce `MediaRecorder` en Chrome
 * (Android y escritorio). Safari en iPhone produce `audio/mp4`. Enviar el blob
 * tal cual funcionaría en iOS y fallaría en Android, así que se normaliza a WAV
 * en el cliente y el servidor recibe siempre lo mismo.
 *
 * Se baja a mono 16 kHz porque Gemini remezcla a un canal y remuestrea a 16 kHz
 * de todas formas: hacerlo aquí no pierde calidad y divide por seis el peso de
 * la subida, que en obra con 3G es lo que marca la diferencia.
 *
 * Solo se ejecuta en el navegador: usa AudioContext.
 */

const FRECUENCIA_DESTINO = 16000;

/** Decodifica, mezcla a mono y remuestrea a 16 kHz. Base de las dos salidas. */
async function renderizarMono16k(blob: Blob): Promise<Float32Array> {
    const datos = await blob.arrayBuffer();

    // decodeAudioData entiende webm/opus en Chrome y mp4/aac en Safari, así que
    // resuelve la diferencia entre navegadores sin ramificar por User-Agent.
    const contexto = new AudioContext();
    let decodificado: AudioBuffer;
    try {
        decodificado = await contexto.decodeAudioData(datos);
    } finally {
        void contexto.close();
    }

    if (decodificado.duration <= 0) {
        throw new Error("La grabación está vacía");
    }

    // OfflineAudioContext con 1 canal hace la mezcla a mono y el remuestreo de
    // una vez, sin bucles a mano.
    const muestras = Math.max(1, Math.ceil(decodificado.duration * FRECUENCIA_DESTINO));
    const offline = new OfflineAudioContext(1, muestras, FRECUENCIA_DESTINO);
    const fuente = offline.createBufferSource();
    fuente.buffer = decodificado;
    fuente.connect(offline.destination);
    fuente.start();

    const renderizado = await offline.startRendering();
    return renderizado.getChannelData(0);
}

export async function convertirAWav(blob: Blob): Promise<File> {
    const muestras = await renderizarMono16k(blob);
    return new File([codificarWav(muestras, FRECUENCIA_DESTINO)], "observaciones.wav", {
        type: "audio/wav",
    });
}

/**
 * Trocea la grabación en WAVs independientes de `segundosPorTrozo`.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ SE TROCEA (18/09/2026)
 * ---------------------------------------------------------------------------
 * El cuerpo de una petición a una función de Vercel no puede pasar de 4,5 MB;
 * por encima devuelve 413 FUNCTION_PAYLOAD_TOO_LARGE. Un WAV mono de 16 kHz
 * ocupa 32 KB por segundo, así que el techo está en unos 140 segundos de
 * dictado. El grabador permitía 180: por encima de 2:20 la transcripción NO
 * era lenta, fallaba siempre, y el comercial no tenía forma de saberlo.
 *
 * Trocear resuelve dos cosas a la vez. Ningún trozo se acerca al límite (30 s
 * son unos 960 KB) y, como se transcriben en paralelo, el tiempo total deja de
 * crecer con la duración del dictado: son tres peticiones simultáneas en vez de
 * una de tres minutos.
 *
 * El corte es por tiempo, no por silencio: puede partir una palabra. Se asume.
 * Gemini transcribe cada trozo con contexto suficiente y el texto se une con un
 * espacio; una palabra ocasionalmente cortada es un precio bajísimo comparado
 * con un 413.
 */
export async function trocearAWav(blob: Blob, segundosPorTrozo = 30): Promise<File[]> {
    const muestras = await renderizarMono16k(blob);
    const porTrozo = Math.max(1, Math.floor(segundosPorTrozo * FRECUENCIA_DESTINO));

    const trozos: File[] = [];

    for (let inicio = 0, i = 0; inicio < muestras.length; inicio += porTrozo, i++) {
        const corte = muestras.subarray(inicio, Math.min(inicio + porTrozo, muestras.length));
        trozos.push(
            new File([codificarWav(corte, FRECUENCIA_DESTINO)], `observaciones-${i + 1}.wav`, {
                type: "audio/wav",
            })
        );
    }

    return trozos;
}

/** Duración en segundos de un blob de audio, sin convertirlo. */
export async function duracionSegundos(blob: Blob): Promise<number> {
    const contexto = new AudioContext();
    try {
        const decodificado = await contexto.decodeAudioData(await blob.arrayBuffer());
        return decodificado.duration;
    } finally {
        void contexto.close();
    }
}

/** WAV PCM 16 bits, un canal. Cabecera de 44 bytes según la especificación RIFF. */
function codificarWav(muestras: Float32Array, frecuencia: number): ArrayBuffer {
    const bytesPorMuestra = 2;
    const buffer = new ArrayBuffer(44 + muestras.length * bytesPorMuestra);
    const vista = new DataView(buffer);

    escribirTexto(vista, 0, "RIFF");
    vista.setUint32(4, 36 + muestras.length * bytesPorMuestra, true);
    escribirTexto(vista, 8, "WAVE");

    escribirTexto(vista, 12, "fmt ");
    vista.setUint32(16, 16, true); // tamaño del bloque fmt
    vista.setUint16(20, 1, true); // 1 = PCM sin comprimir
    vista.setUint16(22, 1, true); // canales
    vista.setUint32(24, frecuencia, true);
    vista.setUint32(28, frecuencia * bytesPorMuestra, true); // bytes por segundo
    vista.setUint16(32, bytesPorMuestra, true); // alineación de bloque
    vista.setUint16(34, 8 * bytesPorMuestra, true); // bits por muestra

    escribirTexto(vista, 36, "data");
    vista.setUint32(40, muestras.length * bytesPorMuestra, true);

    let offset = 44;
    for (let i = 0; i < muestras.length; i++) {
        // Recorte a [-1, 1] antes de escalar: fuera de rango, el entero de 16
        // bits desborda y la muestra suena como un chasquido.
        const valor = Math.max(-1, Math.min(1, muestras[i]));
        vista.setInt16(offset, valor < 0 ? valor * 0x8000 : valor * 0x7fff, true);
        offset += bytesPorMuestra;
    }

    return buffer;
}

function escribirTexto(vista: DataView, offset: number, texto: string): void {
    for (let i = 0; i < texto.length; i++) {
        vista.setUint8(offset + i, texto.charCodeAt(i));
    }
}