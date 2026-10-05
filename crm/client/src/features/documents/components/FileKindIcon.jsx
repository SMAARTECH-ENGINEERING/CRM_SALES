import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import { KIND, kindOf } from '../lib/fileKinds.js';

const ICONS = {
  [KIND.PDF]: { icon: PictureAsPdfOutlinedIcon, color: 'error.main', label: 'PDF' },
  [KIND.EXCEL]: { icon: TableChartOutlinedIcon, color: 'success.main', label: 'Spreadsheet' },
  [KIND.CSV]: { icon: TableChartOutlinedIcon, color: 'success.main', label: 'CSV' },
  [KIND.WORD]: { icon: DescriptionOutlinedIcon, color: 'info.main', label: 'Word' },
  [KIND.IMAGE]: { icon: ImageOutlinedIcon, color: 'warning.main', label: 'Image' },
  [KIND.TEXT]: { icon: ArticleOutlinedIcon, color: 'text.secondary', label: 'Text' },
  [KIND.OTHER]: { icon: InsertDriveFileOutlinedIcon, color: 'text.secondary', label: 'File' },
};

export const kindLabel = (document) => ICONS[kindOf(document)].label;

// The icon for a document's kind of file, coloured by kind; labelled for
// screen readers unless `decorative` (when the kind is said next to it anyway).
export default function FileKindIcon({ document, fontSize = 'small', decorative = false }) {
  const { icon: Icon, color, label } = ICONS[kindOf(document)];
  return <Icon fontSize={fontSize} sx={{ color, flexShrink: 0 }} {...(decorative ? { 'aria-hidden': true } : { titleAccess: label })} />;
}
