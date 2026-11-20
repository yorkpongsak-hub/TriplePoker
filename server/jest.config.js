module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  // isolatedModules: transpile ทีละไฟล์ กัน type ของ react-native/expo (จากเทส client เช่น audio) ปนข้ามเทสใน worker เดียวกัน
  // การเช็ค type ทั้งหมดยังทำผ่าน `tsc --noEmit -p .` (tsconfig รวม tests/ อยู่แล้ว)
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', isolatedModules: true } }] },
};
