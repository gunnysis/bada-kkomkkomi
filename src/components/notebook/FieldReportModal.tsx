import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Mail,
  Camera,
  X,
  Send,
  AlertCircle,
  Compass,
  CheckCircle2,
  MapPin,
  Settings2,
} from 'lucide-react';
import type { FieldReportData } from '../../types/report';
import type { AdminConfig } from '../../types/config';
import { sendFieldReport } from '../../services/emailReportService';

interface FieldReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  pointId?: string;
  pointName?: string;
  initialLat: number;
  initialLng: number;
  adminConfig: AdminConfig;
  onUpdateAdminEmail: (newEmail: string) => void;
  onPickLocationOnMap: () => void;
}

export function FieldReportModal({
  isOpen,
  onClose,
  pointId,
  pointName,
  initialLat,
  initialLng,
  adminConfig,
  onUpdateAdminEmail,
  onPickLocationOnMap,
}: FieldReportModalProps) {
  const [memo, setMemo] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [recipientEmailInput, setRecipientEmailInput] = useState(
    adminConfig.report_recipient_email,
  );

  if (!isOpen) return null;

  // 사진 업로드 및 Canvas 압축 (최대 1200px)
  const handlePhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1200;

          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setPhotos((prev) => [...prev, compressed].slice(0, 4));
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveRecipientEmail = () => {
    const trimmed = recipientEmailInput.trim();
    if (!trimmed || !trimmed.includes('@')) {
      alert('유효한 이메일 주소를 입력해주세요.');
      return;
    }
    onUpdateAdminEmail(trimmed);
    setIsEditingEmail(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!memo.trim()) {
      alert('현장 메모 내용을 입력해주세요.');
      return;
    }

    setIsSending(true);
    setSendResult(null);

    const reportData: FieldReportData = {
      pointId,
      pointName,
      lat: initialLat,
      lng: initialLng,
      reporterName,
      memo,
      photos,
      createdAt: new Date().toISOString(),
    };

    const res = await sendFieldReport(reportData, adminConfig);
    setIsSending(false);

    if (res.success) {
      setSendResult('제보 내용이 이메일 클라이언트/공유창으로 전달되었습니다.');
      window.setTimeout(() => {
        onClose();
      }, 1400);
    } else {
      alert(res.error || '이메일 전송 호출 중 오류가 발생했습니다.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border-2 border-slate-600 bg-[#0b192c] p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700/90 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2 id="report-modal-title" className="text-base font-black tracking-tight text-white">
                현장정보 이메일 제보
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>수신:</span>
                <span className="font-mono font-bold text-sky-300">
                  {adminConfig.report_recipient_email}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingEmail((v) => !v)}
                  className="inline-flex items-center gap-0.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-slate-700"
                >
                  <Settings2 className="h-3 w-3" />
                  <span>변경</span>
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="제보 창 닫기"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-white active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 운영자 수신 이메일 설정/변경 패널 */}
        {isEditingEmail && (
          <div className="mt-3 rounded-2xl border border-amber-500/50 bg-slate-900 p-3">
            <label className="mb-1 block text-xs font-bold text-amber-300">
              제보 수신 관리자 이메일 설정
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={recipientEmailInput}
                onChange={(e) => setRecipientEmailInput(e.target.value)}
                placeholder="marine_admin@knps.or.kr"
                className="flex-1 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-mono text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveRecipientEmail}
                className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 active:scale-95"
              >
                저장
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              * 영구 기본값은 <code className="text-sky-300">public/config/app_config.json</code>에서 관리하며, 이곳에서 변경 시 현재 기기에 즉시 적용됩니다.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* 1. 제보 위치 정보 및 지도 위치 재지정 버튼 */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-400">제보 위치 좌표</span>
                <p className="mt-0.5 flex items-center gap-1 font-mono text-xs font-black text-sky-300">
                  <Compass className="h-3.5 w-3.5 text-sky-400" />
                  {initialLat.toFixed(5)}°N, {initialLng.toFixed(5)}°E
                </p>
              </div>
              <button
                type="button"
                onClick={onPickLocationOnMap}
                className="flex items-center gap-1 rounded-xl border border-sky-400/60 bg-sky-500/20 px-2.5 py-2 text-xs font-black text-sky-300 active:scale-95"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>지도에서 위치 선택</span>
              </button>
            </div>
            {pointName ? (
              <p className="mt-1.5 text-sm font-extrabold text-white">
                {pointId ? `[${pointId}] ` : ''}
                {pointName}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">
                특정 접안 포인트와 무관한 독립 현장 제보 위치입니다.
              </p>
            )}
          </div>

          {/* 2. 제보자 이름 (선택) */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-300">
              제보자 이름 / 소속 (선택)
            </label>
            <input
              type="text"
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              placeholder="예: 홍길동 주무관"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm font-bold text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
            />
          </div>

          {/* 3. 현장 자유 메모 (필수) */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-300">
              현장 자유 메모 및 위험/특이사항 (필수)
            </label>
            <textarea
              required
              rows={4}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 물양장 3번 비트 볼트 부식으로 계류 시 파손 위험. 간조 시 노출 암초 신규 확인."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3.5 text-sm font-bold text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
            />
          </div>

          {/* 4. 현장 사진 첨부 */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-300">
              현장 사진 첨부 (최대 4장)
            </label>
            <div className="flex flex-wrap gap-2.5">
              {photos.map((src, i) => (
                <div
                  key={i}
                  className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-600 bg-slate-800"
                >
                  <img src={src} alt={`첨부사진 ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label={`첨부사진 ${i + 1} 삭제`}
                    className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {photos.length < 4 && (
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-600 bg-slate-900/60 text-slate-400 transition hover:border-sky-400 hover:text-sky-300">
                  <Camera className="h-5 w-5" />
                  <span className="mt-1 text-[10px] font-black">사진 추가</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* 안내문 */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 text-[11px] leading-relaxed text-slate-400">
            <div className="mb-0.5 flex items-center gap-1.5 font-bold text-amber-300">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>안내: 공식 지도에 자동 반영되지 않습니다</span>
            </div>
            제보 내용은 관리자가 이메일로 검토한 후 QGIS 원본 데이터를 수정하여 반영합니다.
          </div>

          {sendResult && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-950/90 p-3 text-xs font-black text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              <span>{sendResult}</span>
            </div>
          )}

          {/* 전송 버튼 */}
          <button
            type="submit"
            disabled={isSending}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-sm font-black text-slate-950 shadow-lg active:scale-95 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span>{isSending ? '전송 준비 중...' : '관리자에게 이메일 제보 전송'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
