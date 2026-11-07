import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Mail, Camera, X, Send, AlertCircle, Compass, CheckCircle2 } from 'lucide-react';
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
}

export function FieldReportModal({
  isOpen,
  onClose,
  pointId,
  pointName,
  initialLat,
  initialLng,
  adminConfig,
}: FieldReportModalProps) {
  const [memo, setMemo] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

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
          setPhotos((prev) => [...prev, compressed].slice(0, 4)); // 최대 4장 제한
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
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
      setSendResult('제보 내용이 이메일 클라이언트/공유창으로 전송 준비되었습니다.');
      window.setTimeout(() => {
        onClose();
        setMemo('');
        setPhotos([]);
        setSendResult(null);
      }, 1500);
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
              <p className="text-xs text-slate-400">
                수신: <span className="font-mono text-sky-300">{adminConfig.report_recipient_email}</span>
              </p>
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* 위치 정보 안내 */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">제보 대상 위치</span>
              <span className="flex items-center gap-1 font-mono text-xs font-black text-sky-300">
                <Compass className="h-3.5 w-3.5 text-sky-400" />
                {initialLat.toFixed(4)}°N, {initialLng.toFixed(4)}°E
              </span>
            </div>
            {pointName ? (
              <p className="mt-1 text-sm font-extrabold text-white">
                {pointId ? `[${pointId}] ` : ''}{pointName}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-300">지도에서 지정한 해상 좌표</p>
            )}
          </div>

          {/* 제보자 이름 */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              제보자 이름 / 직급 (선택)
            </label>
            <input
              type="text"
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              placeholder="예: 홍길동 주무관"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm font-bold text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
            />
          </div>

          {/* 현장 메모 */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              현장 특이사항 및 메모 (필수)
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

          {/* 현장 사진 첨부 */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              현장 사진 첨부 (최대 4장)
            </label>
            <div className="flex flex-wrap gap-2.5">
              {photos.map((src, i) => (
                <div key={i} className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-600 bg-slate-800">
                  <img src={src} alt={`첨부사진 ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {photos.length < 4 && (
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-600 bg-slate-900/60 text-slate-400 transition hover:border-sky-400 hover:text-sky-300">
                  <Camera className="h-5 w-5" />
                  <span className="mt-1 text-[10px] font-black">추가</span>
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
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 text-[11px] text-slate-400 leading-relaxed">
            <div className="flex items-center gap-1.5 font-bold text-amber-300 mb-0.5">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>안내: 자동 반영되지 않습니다</span>
            </div>
            제보 내용은 관리자 검토 후 QGIS 공식 지도 데이터에 반영됩니다. 전송 버튼을 누르면 기기의 이메일/메신저 앱이 실행됩니다.
          </div>

          {sendResult && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-950/90 border border-emerald-500/50 p-3 text-xs font-black text-emerald-300">
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
