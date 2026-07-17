// ProfilePicturePicker.tsx
// Modal เลือกวิธีตั้งรูปโปรไฟล์: Upload Photo (เฉพาะ VIP) หรือ Choose Avatar (ระบบ Preset — 33 แบบ)
// รูปจริงเก็บที่ Supabase Storage bucket "avatars" path {userId}.webp (upsert ทับไฟล์เดิม)
// DB เก็บแค่ path ใน users.profile_image_url แล้ว parent ขอ signed URL ตอน render เอง
//
// ปิด Upload Photo ชั่วคราว (MVP VIP Avatar Preset, 2026-07-17) — รอ moderation system ก่อน
// (PDPA/UGC: รูปจริงที่ผู้ใช้อัปโหลดเองต้องมี content moderation ก่อนเปิดใช้งานจริง ยังไม่มี pipeline
// นี้อยู่) โค้ด handleUploadPhoto + ปุ่มด้านล่างยังอยู่ครบ (ซ่อนด้วย {false && ...} ไม่ลบ) lazy cleanup
// ฝั่ง server (recover-escrow) ยังทำงานตามปกติ ไม่ได้แตะ

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../../services/supabaseService';

interface Props {
  visible: boolean;
  onClose: () => void;
  isVip: boolean;
  userId: string;
  // parent ส่ง refreshProfile ของ authStore เข้ามา เรียกหลัง upload สำเร็จ
  onUploaded: () => Promise<void> | void;
  // parent จัดการ navigate ไป setup-profile (พฤติกรรมเดิมของปุ่มดินสอ)
  onChooseAvatar: () => void;
}

// แปลง base64 เป็น Uint8Array เองโดยไม่พึ่ง atob (กัน runtime ที่ไม่มี global atob)
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const val = B64_CHARS.indexOf(clean[i]);
    if (val === -1) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export default function ProfilePicturePicker({
  visible,
  onClose,
  isVip,
  userId,
  onUploaded,
  onChooseAvatar,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUploadPhoto = async () => {
    if (!isVip || uploading) return;
    try {
      setError(null);

      // 1) ขอ permission เข้า photo library
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('Photo library permission is required.');
        return;
      }

      // 2) เลือกรูป + crop 1:1 ในตัว picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (result.canceled || !result.assets || !result.assets[0]) return;

      setUploading(true);

      // 3) resize 256x256 + แปลงเป็น WebP (Android รองรับ)
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 256, height: 256 } }],
        {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.WEBP,
          base64: true,
        }
      );
      if (!manipulated.base64) throw new Error('image processing failed');

      // 4) upload ทับไฟล์เดิม (upsert) - RLS คุมสิทธิ์ path {uid}.webp อยู่แล้ว
      const path = userId + '.webp';
      const bytes = base64ToBytes(manipulated.base64);
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, bytes.buffer as ArrayBuffer, {
          contentType: 'image/webp',
          upsert: true,
        });
      if (upErr) throw upErr;

      // 5) เก็บ path ลง DB (ไม่เก็บ signed URL เพราะหมดอายุ)
      const { error: dbErr } = await supabase
        .from('users')
        .update({ profile_image_url: path })
        .eq('user_id', userId);
      if (dbErr) throw dbErr;

      // 6) ให้ parent refresh store แล้วปิด modal
      await onUploaded();
      onClose();
    } catch (e) {
      console.log('[ProfilePicturePicker] upload error:', e);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Edit Profile Picture</Text>

          {/* ตัวเลือก 1: Upload Photo (VIP เท่านั้น) — ปิดชั่วคราว รอ moderation system (ดู comment บนไฟล์) */}
          {false && (
            <TouchableOpacity
              style={[styles.option, !isVip && styles.optionLocked]}
              onPress={handleUploadPhoto}
              disabled={uploading}
              activeOpacity={0.7}
            >
              {uploading ? (
                <ActivityIndicator color="#FFD76A" />
              ) : (
                <>
                  <Text style={styles.optionIcon}>{isVip ? '📷' : '🔒'}</Text>
                  <View style={styles.optionTextWrap}>
                    <Text style={[styles.optionTitle, !isVip && styles.textDim]}>
                      Upload Photo
                    </Text>
                    <Text style={styles.optionSub}>
                      {isVip
                        ? 'Use your own photo from gallery'
                        : 'VIP Exclusive - Upgrade to unlock'}
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* ตัวเลือก 2: Choose Avatar (ระบบ Preset — ไปหน้า setup-profile) */}
          <TouchableOpacity
            style={styles.option}
            onPress={() => {
              onClose();
              onChooseAvatar();
            }}
            disabled={uploading}
            activeOpacity={0.7}
          >
            <Text style={styles.optionIcon}>🎭</Text>
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionTitle}>Choose Avatar</Text>
              <Text style={styles.optionSub}>Pick from preset avatars</Text>
            </View>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={uploading}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// สีตาม TriplePoker Official Theme (dark emerald + gold)
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#163A25',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3A5A44',
    padding: 20,
  },
  title: {
    color: '#FFD76A',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C4830',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A4A34',
    padding: 14,
    marginBottom: 10,
    minHeight: 64,
  },
  optionLocked: {
    opacity: 0.75,
  },
  optionIcon: {
    fontSize: 26,
    marginRight: 12,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    color: '#F5F2E8',
    fontSize: 15,
    fontWeight: '600',
  },
  optionSub: {
    color: '#C8C4B0',
    fontSize: 12,
    marginTop: 2,
  },
  textDim: {
    color: '#7A7A6A',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  cancelText: {
    color: '#C8C4B0',
    fontSize: 14,
  },
});
