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

export async function convertirAWav(blob: Blob): Promise<File> {
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
    const wav = codificarWav(renderizado.getChannelData(0), FRECUENCIA_DESTINO);

    return new File([wav], "observaciones.wav", { type: "audio/wav" });
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