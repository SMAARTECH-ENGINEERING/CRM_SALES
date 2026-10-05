import '@fortune-sheet/react/dist/index.css';
import { Workbook } from '@fortune-sheet/react';
import Box from '@mui/material/Box';
import { forwardRef } from 'react';

// The spreadsheet grid (Fortune-sheet): formulas, formatting, merged cells,
// sheet tabs, copy and paste, undo and redo. Read-only unless `editable`.
//
//   <SheetView ref={workbook} data={sheets} editable onChange={setSheets} />
//
// `ref` gives the workbook's API (getAllSheets(), ...). Loaded with the page
// that uses it - it is large.
const SheetView = forwardRef(function SheetView({ data, editable = false, onChange, height = '100%' }, ref) {
  return (
    // Fortune-sheet draws its own light UI; it is kept light in dark mode too.
    <Box sx={{ height, minHeight: 320, position: 'relative', colorScheme: 'light', '& .fortune-container': { fontFamily: 'inherit' } }}>
      <Workbook
        ref={ref}
        data={data}
        onChange={onChange}
        allowEdit={editable}
        showToolbar={editable}
        showFormulaBar={editable}
        showSheetTabs
        lang="en"
      />
    </Box>
  );
});

export default SheetView;
