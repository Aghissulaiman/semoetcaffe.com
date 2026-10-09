import { commonErrors, ref } from '../helpers.js';
import type { PathSpec } from '../helpers.js';

const tags = ['Auth & Identity'];

export const authPaths: Record<string, PathSpec> = {
  '/auth/register': {
    post: {
      tags,
      summary: 'Daftar akun baru',
      description:
        'Membuat user baru beserta customer_profile dan role customer. ' +
        'Wajib mengisi email atau nomor telepon. Kirim header Idempotency-Key agar ' +
        'pendaftaran ganda tidak membuat dua akun.',
      operationId: 'authRegister',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('RegisterRequest'),
            example: {
              email: 'siti@example.com',
              password: 'RahasiaKuat123',
              displayName: 'Siti Rahma',
              marketingOptIn: true,
              deviceLabel: 'iPhone 15',
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Akun dibuat. Response berisi user dan access token.',
          content: { 'application/json': { schema: ref('AuthSession') } },
        },
        '400': commonErrors.validation,
        '409': {
          description: 'Email atau nomor telepon sudah terdaftar.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '429': commonErrors.rateLimited,
      },
    },
  },

  '/auth/login': {
    post: {
      tags,
      summary: 'Login dengan email/nomor + password',
      operationId: 'authLogin',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('LoginRequest'),
            example: { identifier: 'siti@example.com', password: 'RahasiaKuat123' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Login berhasil, refresh token disimpan sebagai cookie httpOnly.',
          content: { 'application/json': { schema: ref('AuthSession') } },
        },
        '401': {
          description: 'Kredensial salah atau akun tidak aktif.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '429': commonErrors.rateLimited,
      },
    },
  },

  '/auth/logout': {
    post: {
      tags,
      summary: 'Logout dan cabut sesi',
      description:
        'Mencabut sesi perangkat ini, atau seluruh perangkat bila body `{ allDevices: true }`. ' +
        'Cookie refresh token ikut dihapus.',
      operationId: 'authLogout',
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: ref('LogoutRequest'),
            example: { allDevices: false },
          },
        },
      },
      responses: {
        '200': {
          description: 'Sesi dicabut.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      revoked: { type: 'integer', description: 'Jumlah sesi yang dicabut.' },
                      allDevices: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '429': commonErrors.rateLimited,
      },
    },
  },

  '/auth/refresh': {
    post: {
      tags,
      summary: 'Rotasi access token',
      description:
        'Menggunakan refresh token dari body atau cookie `semoet_refresh`. ' +
        'Refresh token lama langsung dicabut (rotasi), sehingga token hanya bisa dipakai sekali.',
      operationId: 'authRefresh',
      security: [],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: ref('RefreshRequest'),
            example: { refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Token baru diterbitkan.',
          content: { 'application/json': { schema: ref('AuthSession') } },
        },
        '401': {
          description: 'Refresh token tidak valid, sudah dipakai, atau kedaluwarsa.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '429': commonErrors.rateLimited,
      },
    },
  },

  '/auth/otp/request': {
    post: {
      tags,
      summary: 'Minta kode OTP',
      description:
        'Mengirim OTP ke nomor telepon. Maksimal 3 permintaan per 15 menit. ' +
        'Kode OTP tidak pernah dikembalikan di response production (hanya log di development).',
      operationId: 'authRequestOtp',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('OtpRequestInput'),
            example: { phoneE164: '628111000111', purpose: 'login' },
          },
        },
      },
      responses: {
        '200': {
          description: 'OTP dikirim. Respons sengaja tidak membocorkan kode OTP.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Kode OTP telah dikirim.' },
                      expiresAt: { type: 'string', format: 'date-time' },
                      retryAfterSeconds: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '429': commonErrors.rateLimited,
      },
    },
  },

  '/auth/otp/verify': {
    post: {
      tags,
      summary: 'Verifikasi OTP',
      description:
        'Memverifikasi kode OTP. Untuk `purpose` login/signup/verify_phone, response berisi ' +
        'token sesi. Untuk `password_reset`, response hanya konfirmasi verifikasi.',
      operationId: 'authVerifyOtp',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('OtpVerifyInput'),
            example: { phoneE164: '628111000111', purpose: 'login', code: '123456' },
          },
        },
      },
      responses: {
        '200': {
          description: 'OTP benar. Bentuk data bergantung pada purpose.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    oneOf: [
                      {
                        allOf: [ref('AuthSession')],
                        type: 'object',
                        properties: { kind: { type: 'string', enum: ['authenticated'] } },
                      },
                      {
                        type: 'object',
                        properties: {
                          kind: { type: 'string', enum: ['password_reset_verified'] },
                          identifier: { type: 'string' },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '401': {
          description: 'Kode OTP salah atau sudah kedaluwarsa.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '429': commonErrors.rateLimited,
      },
    },
  },

  '/auth/password/forgot': {
    post: {
      tags,
      summary: 'Minta tautan / OTP reset password',
      description:
        'Selalu merespons sukses baik dengan identifier terdaftar maupun tidak, ' +
        'agar endpoint ini tidak bisa dipakai untuk enumerasi akun.',
      operationId: 'authForgotPassword',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('ForgotPasswordRequest'),
            example: { identifier: 'siti@example.com' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Permintaan diterima.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'object', properties: { message: { type: 'string' } } },
                },
              },
            },
          },
        },
        '429': commonErrors.rateLimited,
      },
    },
  },

  '/auth/password/reset': {
    post: {
      tags,
      summary: 'Atur password baru',
      description: 'Memakai identifier + token reset (atau OTP) untuk menetapkan password baru.',
      operationId: 'authResetPassword',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('ResetPasswordRequest'),
            example: { identifier: 'siti@example.com', token: 'abc123...', newPassword: 'PasswordBaru123' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Password diganti. Semua sesi lama dicabut.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'object', properties: { message: { type: 'string' } } },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/auth/password': {
    patch: {
      tags,
      summary: 'Ganti password milik sendiri',
      description: 'Memverifikasi password saat ini, lalu mencabut sesi perangkat lain.',
      operationId: 'authChangePassword',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('ChangePasswordRequest'),
            example: { currentPassword: 'RahasiaKuat123', newPassword: 'PasswordBaru123' },
          },
        },
      },
      responses: {
        '200': { description: 'Password diganti.', content: { 'application/json': { schema: ref('MessageResponse') } } },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/auth/oauth/{provider}': {
    post: {
      tags,
      summary: 'Login / daftar lewat Google atau Apple',
      description:
        'Verifikasi ID token dari provider, lalu menautkan akun ke `auth_identities`. ' +
        'User baru otomatis dibuat bila identitas ini belum pernah terdaftar.',
      operationId: 'authOAuth',
      security: [],
      parameters: [
        {
          name: 'provider',
          in: 'path',
          required: true,
          description: 'Provider OAuth.',
          schema: { type: 'string', enum: ['google', 'apple'] },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('OAuthRequest'),
            example: { idToken: 'eyJhbGciOiJSUzI1NiIs...', deviceLabel: 'iPhone 15' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Berhasil login (atau daftar) lewat OAuth.',
          content: { 'application/json': { schema: ref('AuthSession') } },
        },
        '401': {
          description: 'ID token tidak valid atau audiens tidak cocok.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '429': commonErrors.rateLimited,
      },
    },
  },

  '/auth/me': {
    get: {
      tags,
      summary: 'Profil ringkas beserta role dan permission',
      description: 'Menampilkan user yang sedang login beserta daftar role serta permission-nya.',
      operationId: 'authMe',
      responses: {
        '200': {
          description: 'Data user aktif.',
          content: { 'application/json': { schema: ref('AuthContextResponse') } },
        },
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/auth/sessions': {
    get: {
      tags,
      summary: 'Daftar sesi aktif (perangkat)',
      description: 'Dipakai user untuk melihat dan mencabut sesi perangkat yang tidak dikenal.',
      operationId: 'authListSessions',
      responses: {
        '200': {
          description: 'Daftar sesi yang belum dicabut dan belum kedaluwarsa.',
          content: { 'application/json': { schema: ref('DeviceSessionList') } },
        },
        '401': commonErrors.unauthorized,
      },
    },
  },
};