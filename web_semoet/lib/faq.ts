/** Konten pusat bantuan (FAQ) untuk pelanggan web. */

export interface FaqCategory {
  id: string;
  label: string;
}

export interface FaqEntry {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: "pesanan", label: "Pesanan" },
  { id: "pembayaran", label: "Pembayaran" },
  { id: "reservasi", label: "Reservasi" },
  { id: "akun", label: "Akun & Poin" },
  { id: "ulasan", label: "Ulasan & Keluhan" },
];

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    id: "cara-pesan",
    categoryId: "pesanan",
    question: "Bagaimana cara memesan di Semoet Cafe?",
    answer:
      "Pilih cabang di halaman Menu, masukkan menu ke keranjang, lalu lanjutkan ke checkout. Pesanan bisa diambil sendiri, diantar, atau dimakan di tempat sesuai pilihan yang tersedia di cabang tersebut.",
  },
  {
    id: "status-pesanan",
    categoryId: "pesanan",
    question: "Di mana saya bisa melihat status pesanan?",
    answer:
      "Buka halaman Pesanan. Setiap pesanan menampilkan status Diterima, Disiapkan, Siap, atau Selesai. Buka detail pesanan untuk melihat linimasa dan rincian item.",
  },
  {
    id: "batalkan-pesanan",
    categoryId: "pesanan",
    question: "Apakah pesanan bisa dibatalkan?",
    answer:
      "Pesanan yang belum diproses dapat dibatalkan dari halaman detail pesanan. Jika pesanan sudah dibayar atau sudah diproses, hubungi kasir atau chat support agar dibantu sesuai ketentuan cabang.",
  },
  {
    id: "pesanan-selesai-masalah",
    categoryId: "pesanan",
    question: "Pesanan sudah selesai, tetapi ada masalah. Apa yang harus saya lakukan?",
    answer:
      "Buka detail pesanan yang sudah selesai, lalu tekan Laporkan ke Chat. Laporan akan masuk ke chat support sebagai keluhan dan tim kami akan membalas melalui halaman chat.",
  },
  {
    id: "toko-tutup",
    categoryId: "pesanan",
    question: "Kenapa saya tidak bisa memesan karena toko tutup?",
    answer:
      "Pemesanan hanya bisa dilakukan saat cabang yang dipilih sedang buka. Jam buka mengikuti pengaturan kasir cabang. Kamu bisa mengganti cabang dari halaman keranjang atau mengikuti jadwal buka yang ditampilkan.",
  },
  {
    id: "metode-pembayaran",
    categoryId: "pembayaran",
    question: "Metode pembayaran apa saja yang tersedia?",
    answer:
      "Tergantung metode yang diaktifkan di cabang, umumnya tersedia QRIS, Virtual Account, E-Wallet, dan bayar tunai di kasir. Pilih metode pada halaman detail pesanan sebelum menyelesaikan pembayaran.",
  },
  {
    id: "pembayaran-belum-masuk",
    categoryId: "pembayaran",
    question: "Saya sudah membayar, tetapi status pesanan belum berubah.",
    answer:
      "Buka detail pesanan dan tekan tombol cek status pembayaran. Jika status masih belum berubah setelah beberapa saat, hubungi chat support dengan menyertakan nomor pesanan.",
  },
  {
    id: "refund",
    categoryId: "pembayaran",
    question: "Bagaimana cara mengajukan refund?",
    answer:
      "Hubungi chat support atau kasir cabang dengan menyertakan nomor pesanan dan alasan refund. Tim akan memeriksa status pembayaran dan proses pengembalian sesuai kebijakan yang berlaku.",
  },
  {
    id: "cara-reservasi",
    categoryId: "reservasi",
    question: "Bagaimana cara reservasi meja atau event?",
    answer:
      "Buka halaman Reservasi, pilih jenis reservasi, isi tanggal, jumlah tamu, dan detail acara bila ada. Setelah dikirim, permintaan akan dikonfirmasi oleh tim cabang.",
  },
  {
    id: "dp-reservasi",
    categoryId: "reservasi",
    question: "Bagaimana ketentuan uang muka reservasi?",
    answer:
      "Reservasi event dapat memerlukan DP1, DP2, dan pelunasan. Nominal dihitung otomatis dari perkiraan total dan ditampilkan di halaman detail reservasi sebelum kamu membayar.",
  },
  {
    id: "ubah-reservasi",
    categoryId: "reservasi",
    question: "Bisakah jadwal reservasi diubah?",
    answer:
      "Perubahan jadwal dapat diajukan melalui chat support. Sertakan nomor atau detail reservasi agar tim cabang dapat mengecek ketersediaan jadwal baru.",
  },
  {
    id: "poin-voucher",
    categoryId: "akun",
    question: "Bagaimana cara memakai poin dan voucher?",
    answer:
      "Buka halaman Voucher & Poin dari profil. Voucher yang tersedia bisa dipilih saat checkout. Poin dapat ditukar dengan reward yang tersedia sesuai saldo dan masa berlaku.",
  },
  {
    id: "akun-bermasalah",
    categoryId: "akun",
    question: "Saya tidak bisa masuk ke akun. Apa yang harus dilakukan?",
    answer:
      "Pastikan email atau nomor telepon dan password sudah benar. Jika masih gagal, hubungi chat support agar tim dapat membantu pengecekan akun.",
  },
  {
    id: "kapan-review",
    categoryId: "ulasan",
    question: "Kapan saya bisa memberikan ulasan?",
    answer:
      "Ulasan hanya bisa diberikan setelah pesanan berstatus Selesai. Buka detail pesanan, lalu tekan Beri ulasan pada item yang ingin dinilai. Kamu dapat menilai makanan, pelayanan, dan kecepatan secara terpisah.",
  },
  {
    id: "ubah-review",
    categoryId: "ulasan",
    question: "Apakah ulasan yang sudah dikirim bisa diubah?",
    answer:
      "Bisa. Buka kembali detail pesanan yang sudah selesai, lalu tekan Ubah pada item yang sudah diulas. Perubahan akan langsung memperbarui ulasan yang tampil.",
  },
  {
    id: "review-tidak-muncul",
    categoryId: "ulasan",
    question: "Kenapa tombol ulasan tidak muncul?",
    answer:
      "Tombol ulasan hanya tersedia pada pesanan yang sudah berstatus Selesai. Jika pesanan belum selesai, tunggu hingga status berubah, lalu muat ulang halaman detail pesanan.",
  },
  {
    id: "lapor-masalah",
    categoryId: "ulasan",
    question: "Bagaimana cara melaporkan masalah pesanan?",
    answer:
      "Pada detail pesanan yang sudah selesai, tekan Laporkan ke Chat. Tulis detail masalah, lalu kirim. Kamu akan diarahkan ke chat support dan bisa melanjutkan percakapan di sana.",
  },
];
