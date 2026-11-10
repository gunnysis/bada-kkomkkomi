import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [memo, setMemo] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [recipientEmailInput, setRecipientEmailInput] = useState(
    adminConfig.report_recipient_email,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

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
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      aria-labelledby="report-modal-title"
      className="bada-modal-dialog knps-modal-surface fixed inset-0 z-[1300] m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-3xl border-2 border-[#00a79d]/65 bg-white p-5 text-[#003360] shadow-2xl"
    >
      <div>
        <div className="flex items-center justify-between border-b border-sky-200 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 text-amber-700">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="report-modal-title"
                className="text-base font-black tracking-tight text-[#003360]"
              >
                현장정보 이메일 제보
              </h2>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <span>수신:</span>
                <span className="font-mono font-bold text-[#0066b3]">
                  {adminConfig.report_recipient_email}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingEmail((v) => !v)}
                  className="inline-flex items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-100"
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
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-[#003360] shadow-2xs active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 운영자 수신 이메일 설정/변경 패널 */}
        {isEditingEmail && (
          <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50/75 p-3">
            <label
              htmlFor="report-recipient-email-input"
              className="mb-1 block text-xs font-extrabold text-amber-950"
            >
              제보 수신 관리자 이메일 설정
            </label>
            <div className="flex gap-2">
              <input
                id="report-recipient-email-input"
                type="email"
                value={recipientEmailInput}
                onChange={(e) => setRecipientEmailInput(e.target.value)}
                placeholder="marine_admin@knps.or.kr"
                className="flex-1 rounded-xl border-2 border-slate-400 bg-white px-3 py-2 font-mono text-base font-bold text-[#003360] focus:border-[#0066b3] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveRecipientEmail}
                className="rounded-xl bg-[#00846c] px-3 py-2 text-xs font-black text-white active:scale-95"
              >
                저장
              </button>
            </div>
            <p className="mt-1 text-[10px] font-semibold text-slate-600">
              * 영구 기본값은 <code className="font-bold text-[#0066b3]">public/config/app_config.json</code>에서 관리하며, 이곳에서 변경 시 현재 기기에 즉시 적용됩니다.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* 1. 제보 위치 정보 및 지도 위치 재지정 버튼 */}
          <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-600">제보 위치 좌표</span>
                <p className="mt-0.5 flex items-center gap-1 font-mono text-xs font-black text-[#0066b3]">
                  <Compass className="h-3.5 w-3.5 text-[#0066b3]" />
                  {initialLat.toFixed(5)}°N, {initialLng.toFixed(5)}°E
                </p>
              </div>
              <button
                type="button"
                onClick={onPickLocationOnMap}
                className="flex items-center gap-1 rounded-xl border border-sky-300 bg-white px-2.5 py-2 text-xs font-black text-[#0066b3] shadow-2xs active:scale-95"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>지도에서 위치 선택</span>
              </button>
            </div>
            {pointName ? (
              <p className="mt-1.5 text-sm font-extrabold text-[#003360]">
                {pointId ? `[${pointId}] ` : ''}
                {pointName}
              </p>
            ) : (
              <p className="mt-1 text-[11px] font-semibold text-slate-600">
                특정 접안 포인트와 무관한 독립 현장 제보 위치입니다.
              </p>
            )}
          </div>

          {/* 2. 제보자 이름 (선택) */}
          <div>
            <label
              htmlFor="report-reporter-name-input"
              className="mb-1 block text-xs font-extrabold text-[#003360]"
            >
              제보자 이름 / 소속 (선택)
            </label>
            <input
              id="report-reporter-name-input"
              type="text"
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              placeholder="예: 홍길동 주무관"
              className="w-full rounded-xl border-2 border-slate-400 bg-white px-3.5 py-2.5 text-base font-bold text-[#003360] placeholder-slate-400 shadow-2xs focus:border-[#0066b3] focus:outline-none"
            />
          </div>

          {/* 3. 현장 자유 메모 (필수) */}
          <div>
            <label
              htmlFor="report-memo-textarea"
              className="mb-1 block text-xs font-extrabold text-[#003360]"
            >
              현장 자유 메모 및 위험/특이사항 (필수)
            </label>
            <textarea
              id="report-memo-textarea"
              required
              rows={4}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 물양장 3번 비트 볼트 부식으로 계류 시 파손 위험. 간조 시 노출 암초 신규 확인."
              className="w-full resize-y rounded-xl border-2 border-slate-400 bg-white p-3.5 text-base font-bold text-[#003360] placeholder-slate-400 shadow-2xs focus:border-[#0066b3] focus:outline-none"
            />
          </div>

          {/* 4. 현장 사진 첨부 */}
          <div>
            <label className="mb-1.5 block text-xs font-extrabold text-[#003360]">
              현장 사진 첨부 (최대 4장)
            </label>
            <div className="flex flex-wrap gap-2.5">
              {photos.map((src, i) => (
                <div
                  key={i}
                  className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-300 bg-slate-100"
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
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-400 bg-slate-50 text-slate-600 transition hover:border-[#0066b3] hover:bg-sky-50 hover:text-[#0066b3]">
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
          <div className="rounded-xl border border-[#d6c6b2] bg-[#f7f4ee] p-3 text-[11px] font-semibold leading-relaxed text-slate-700">
            <div className="mb-0.5 flex items-center gap-1.5 font-extrabold text-[#8b5e3c]">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>안내: 외부 서버 수집 없이 기기 메일·공유 앱으로 직접 전달됩니다</span>
            </div>
            제보 내용은 별도 중계 서버에 저장되지 않고 사용자의 메일 앱(또는 모바일 공유시트)으로 직접 발송되며, 위치 확인 편의를 위해 네이버·구글 지도 좌표 링크가 자동 첨부됩니다. 관리자가 검토 후 QGIS 원본 데이터를 수정하여 반영합니다.
          </div>

          {sendResult && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-black text-[#00846c]">
              <CheckCircle2 className="h-4 w-4" />
              <span>{sendResult}</span>
            </div>
          )}

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={isSending}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00854a] via-[#00846c] to-[#0066b3] py-3.5 text-sm font-black text-white shadow-md transition active:scale-95 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span>{isSending ? '제보 데이터 구성 중...' : '이메일 클라이언트로 제보 발송'}</span>
          </button>
        </form>
      </div>
    </dialog>
  );
}
