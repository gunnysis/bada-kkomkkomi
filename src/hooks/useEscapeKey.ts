import { useEffect } from 'react';

/**
 * 모달·드로어·라이트박스가 열려 있을 때 Escape 키 입력으로 닫기를 수행하는 공통 접근성 훅
 */
export function useEscapeKey(
  isOpen: boolean,
  onClose: () => void,
  stopPropagation = false,
): void {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (stopPropagation) {
          e.stopPropagation();
          e.preventDefault();
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, stopPropagation);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, stopPropagation);
    };
  }, [isOpen, onClose, stopPropagation]);
}
