/**
 * Публичные примитивы дизайн-системы «Стройка ИИ».
 * Правила — docs/design-system.md, значения — shared/styles/tokens.css.
 */

export { Button } from "./Button/Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button/Button";

export { Badge } from "./Badge/Badge";
export type { BadgeProps, BadgeTone } from "./Badge/Badge";

export { Tile } from "./Tile/Tile";
export type { TileProps, TileTone } from "./Tile/Tile";

export { Card } from "./Card/Card";
export type { CardProps } from "./Card/Card";

export { StatRow } from "./StatRow/StatRow";
export type { Stat, StatDeltaTone, StatRowProps } from "./StatRow/StatRow";

export { Insight } from "./Insight/Insight";
export type { InsightProps, InsightTone } from "./Insight/Insight";

export { Breakdown } from "./Breakdown/Breakdown";
export type { BreakdownProps, Segment, SegmentTone } from "./Breakdown/Breakdown";

export { Checkbox, RadioGroup, Segmented, Switch } from "./Controls";
export type {
  CheckboxProps,
  RadioGroupProps,
  RadioItem,
  SegmentedItem,
  SegmentedProps,
  SwitchProps,
} from "./Controls";

export { Field } from "./Field/Field";
export type { FieldCounter, FieldProps } from "./Field/Field";

export { Select, Textarea } from "./FormControls";
export type { SelectProps, TextareaProps } from "./FormControls";

export { Chip } from "./Chip";
export type { ChipProps } from "./Chip";

export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";

export { Search } from "./Search";
export type { SearchProps } from "./Search";

export { Progress, ProgressSteps } from "./Progress";
export type { ProgressProps, ProgressStepsProps, ProgressTone, ProgressVariant } from "./Progress";

export { Avatar } from "./Avatar";
export type { AvatarProps, AvatarSize, AvatarStatus, AvatarTone } from "./Avatar";

export { RangeSlider, Slider } from "./Slider";
export type { RangeSliderProps, SliderProps, SliderTone } from "./Slider";

export { Alert } from "./Alert";
export type { AlertProps, AlertTone } from "./Alert";

export { Breadcrumbs } from "./Breadcrumbs";
export type { BreadcrumbItem, BreadcrumbsProps } from "./Breadcrumbs";

export { ActionPreview } from "./ActionPreview";
export type { ActionPreviewProps } from "./ActionPreview";

export { ResultNotice } from "./ResultNotice";
export type { ResultNoticeProps } from "./ResultNotice";

export { ThinkingSteps } from "./ThinkingSteps";
export type { ThinkingStep, ThinkingStepsProps, ThinkingStepStatus } from "./ThinkingSteps";

export { AiBlock } from "./AiBlock/AiBlock";
export type { AiBlockProps } from "./AiBlock/AiBlock";

export { Table, Td, Th, Tr } from "./Table/Table";
export type { TableProps, TdProps, ThProps, TrProps } from "./Table/Table";

export { Tabs } from "./Tabs";
export type { TabItem, TabsProps } from "./Tabs";

export { Spinner } from "./Spinner/Spinner";
export { Skeleton } from "./Skeleton/Skeleton";
export type { SpinnerProps, SpinnerSize } from "./Spinner/Spinner";

export { EmptyState } from "./EmptyState/EmptyState";
export type { EmptyStateProps } from "./EmptyState/EmptyState";

export { ErrorState } from "./ErrorState/ErrorState";
export type { ErrorStateProps } from "./ErrorState/ErrorState";

export { ConfirmModal, FormModal, Modal, ModalProvider, useModalStack } from "./Modal";
export type {
  ConfirmModalProps,
  FormModalProps,
  ModalCloseReason,
  ModalProps,
  ModalSize,
  ModalStack,
} from "./Modal";
