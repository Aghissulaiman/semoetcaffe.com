/**
 * Konten QnA halaman Reservasi Semoet Cafe.
 *
 * Semua teks di sini dipakai apa adanya (script CS) supaya mudah diperbarui
 * tanpa menyentuh UI. Format reservasi disimpan sebagai teks utuh agar bisa
 * disalin tamu lalu diisi.
 */

/** Sapaan pembuka di atas halaman. */
export const RESERVATION_GREETING =
  'Halo Kak, ada yang bisa aku bantu mengenai reservasi di Semoet Cafe? ☺️';

/** Nomor WhatsApp CS. Isi di sini saat nomornya sudah tersedia. */
export const RESERVATION_WHATSAPP = '';

/** Alamat lengkap cabang. */
export const RESERVATION_ADDRESS = [
  'Semoet Cafe',
  'Jl. Radar Baru Ujung No.50-51, Pasir Gn. Sel., Kec. Cimanggis, Kota Depok, Jawa Barat 16451',
].join('\n');

export interface ReservationLink {
  id: 'area' | 'pricelist' | 'maps';
  label: string;
  hint: string;
  url: string;
}

/** Tautan penting yang sering diminta tamu. */
export const RESERVATION_LINKS: ReservationLink[] = [
  {
    id: 'area',
    label: 'Foto Area',
    hint: 'Umbrella, beanbag, picnic, indoor',
    url: 'https://drive.google.com/drive/u/0/folders/1uVyAFRRGNMRu1p9ZYPoF_okc0d_1wsTQ',
  },
  {
    id: 'pricelist',
    label: 'Pricelist Menu',
    hint: 'Daftar harga menu & paket',
    url: 'https://drive.google.com/drive/folders/105WUK0dpzrpBujzp-Bt63dFRvdkmXoZS',
  },
  {
    id: 'maps',
    label: 'Rute Lokasi',
    hint: 'Buka di Google Maps',
    url: 'https://maps.app.goo.gl/e95BSZNEMucffxq37',
  },
];

/** Template form yang bisa disalin tamu lalu diisi. */
export const RESERVATION_FORM_TEMPLATE = `Format Reservasi Event

Nama :
No telp :
Jumlah orang :
Tanggal :
Jam :
Event/Acara :
Nomor Table :
Area : umbrella / beanbag / picnic / indoor
Order menu/Package :`;

export interface ReservationSection {
  id: string;
  title: string;
  subtitle?: string;
  /** Paragraf-paragraf isi jawaban. */
  paragraphs: string[];
  /** Daftar berpoin, bila ada. */
  bullets?: string[];
  /** Catatan tambahan yang ditampilkan sebagai kutipan kecil. */
  note?: string;
}

/** Detail tiap topik QnA. */
export const RESERVATION_SECTIONS: ReservationSection[] = [
  {
    id: 'form',
    title: 'Form Reservasi',
    subtitle: 'Isi dulu formnya, kami cek ketersediaan',
    paragraphs: [
      'Bisa diisi terlebih dahulu untuk formnya agar kami cek ketersediaannya. Jika available, bisa dilanjutkan dengan pembayaran DP Rp300.000 – Rp500.000 😊🙏',
    ],
    note:
      'Untuk pemesanan langsung di tempat mungkin akan ada keterlambatan dalam penyajian karena kami menyesuaikan antrian reservasi 🙏☺️',
  },
  {
    id: 'dp',
    title: 'DP Acara',
    subtitle: 'DP booking / reservasi tempat atau tanggal',
    paragraphs: [
      'Untuk booking tanggal & tempat, kami kenakan biaya sebesar Rp300.000 – Rp500.000.',
    ],
    bullets: [
      'Untuk list menu dikirimkan paling lambat H-3 sebelum acara.',
      'Untuk pelunasan paling lambat di H-2 sebelum acara.',
    ],
  },
  {
    id: 'wedding',
    title: 'Wedding 2026',
    subtitle: 'Mulai 18 Juta-an, sudah include banyak',
    paragraphs: [
      'Wedding sudah start dari 18Jt an aja nih kak ☺️, sudah include:',
    ],
    bullets: [
      'Venue 4 Jam',
      'Catering 100Pax (dengan banyak pilihan menunya)',
      'MUA & Attire',
      'Dekorasi Wedding',
      'PhotoGrapher',
      'Sound System + SoundMan',
      'Akses Parkir Mobil 25 & Motor hingga 100+',
      'Free Undangan Digital',
      'dllnya',
    ],
    note: 'Harga belum termasuk Tax & Service ya kak.',
  },
  {
    id: 'sistem-event',
    title: 'Sistem Event',
    subtitle: 'Pembayaran Wedding & Engagement',
    paragraphs: [
      'INFO SISTEM PEMBAYARAN WEDDING & ENGAGEMENT - SEMOET CAFE',
      'Hai calon pengantin dan pasangan bahagia! 💍✨',
      'Berikut sistem pembayaran untuk paket Wedding, Intimate Wedding, dan Engagement di Semoet Cafe:',
    ],
    bullets: [
      'DP 20% saat booking sebagai tanda jadi',
      'Sisa pembayaran bisa dicicil secara fleksibel',
      'Tidak ada minimal nominal cicilan — bebas berapa saja',
      'Pelunasan maksimal H-3 sebelum hari acara',
      'Setiap transaksi akan diberikan Nota/Invoice digital resmi dari Semoet Cafe',
    ],
    note: 'Lebih fleksibel, lebih tenang dalam persiapan hari bahagia! 🌸',
  },
  {
    id: 'lokasi',
    title: 'Lokasi',
    subtitle: 'Depok, Jawa Barat',
    paragraphs: [RESERVATION_ADDRESS],
  },
  {
    id: 'live-music',
    title: 'Live Music',
    subtitle: 'Setiap Sabtu & Minggu',
    paragraphs: ['Live music ada di setiap hari Sabtu dan Minggu di jam 6 sore ya Kak ☺️'],
  },
  {
    id: 'booked',
    title: 'Sudah Dipesan',
    subtitle: 'Balasan saat reservasi berhasil',
    paragraphs: ['Untuk tablenya sudah dibookingkan ya kak, ditunggu kedatangannya 😊❤️'],
  },
  {
    id: 'full',
    title: 'Reservasi Penuh',
    subtitle: 'Balasan saat hari tersebut full',
    paragraphs: ['Mohon maaf hari ini full Kak, mungkin bisa aku bantu di tanggal lain Kak? 🥺🙏🏻'],
  },
];
