"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useMemo } from "react";

export const DEFAULT_TABLE_PAGE_SIZE = 10;

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export type TablePaginationState = {
  page: number;
  pageSize: number;
};

type TablePaginationProps = {
  currentPage: number;
  itemLabelPlural: string;
  itemLabelSingular: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSize: number;
  pageSizeOptions?: number[];
  totalItems: number;
  totalPages: number;
};

function positiveInteger(value: unknown) {
  const numeric = Number(value);

  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function paginateRows<T>(
  rows: T[],
  pagination: TablePaginationState
) {
  const pageSize =
    positiveInteger(pagination.pageSize) ?? DEFAULT_TABLE_PAGE_SIZE;
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = clamp(
    positiveInteger(pagination.page) ?? 1,
    1,
    totalPages
  );
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  return {
    currentPage,
    endItem: totalItems ? endIndex : 0,
    pageSize,
    rows: rows.slice(startIndex, endIndex),
    startItem: totalItems ? startIndex + 1 : 0,
    totalItems,
    totalPages,
  };
}

export function TablePagination({
  currentPage,
  itemLabelPlural,
  itemLabelSingular,
  onPageChange,
  onPageSizeChange,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  totalItems,
  totalPages,
}: TablePaginationProps) {
  const startItem = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = totalItems ? Math.min(currentPage * pageSize, totalItems) : 0;
  const itemLabel = totalItems === 1 ? itemLabelSingular : itemLabelPlural;
  const normalizedPageOptions = useMemo(() => {
    return Array.from(
      new Set([...pageSizeOptions, pageSize].filter((value) => value > 0))
    ).sort((first, second) => first - second);
  }, [pageSize, pageSizeOptions]);

  return (
    <nav
      aria-label={`Paginación de ${itemLabelPlural}`}
      className="table-pagination"
    >
      <p className="table-pagination-summary">
        Mostrando {startItem}-{endItem} de {totalItems} {itemLabel}
      </p>

      <div className="table-pagination-controls">
        <label className="table-page-size-control">
          <span>Ítems por página</span>
          <select
            aria-label="Seleccionar ítems por página"
            className="field-control table-page-size-select"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {normalizedPageOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="table-page-buttons">
          <button
            aria-label="Primera página"
            className="icon-button"
            disabled={currentPage <= 1 || totalItems === 0}
            title="Primera página"
            type="button"
            onClick={() => onPageChange(1)}
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            aria-label="Página anterior"
            className="icon-button"
            disabled={currentPage <= 1 || totalItems === 0}
            title="Página anterior"
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="table-page-indicator">
            Página {currentPage} de {totalPages}
          </span>
          <button
            aria-label="Página siguiente"
            className="icon-button"
            disabled={currentPage >= totalPages || totalItems === 0}
            title="Página siguiente"
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
          >
            <ChevronRight size={16} />
          </button>
          <button
            aria-label="Última página"
            className="icon-button"
            disabled={currentPage >= totalPages || totalItems === 0}
            title="Última página"
            type="button"
            onClick={() => onPageChange(totalPages)}
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
