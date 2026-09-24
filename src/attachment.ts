export type AttachmentKind = 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'archive' | 'image' | 'audio' | 'video' | 'code' | 'text' | 'file'

const extensionOf = (name: string) => name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''

export function getAttachmentPresentation(name: string, mimeType = ''): { kind: AttachmentKind; label: string; extension: string } {
  const extension = extensionOf(name)
  const mime = mimeType.toLowerCase()
  if (extension === 'pdf' || mime === 'application/pdf') return { kind: 'pdf', label: "ui.pdfDocument", extension: 'PDF' }
  if (/^(docx?|odt|rtf|pages)$/.test(extension) || /word|opendocument\.text|rtf/.test(mime)) return { kind: 'document', label: "resource.document", extension: extension.toUpperCase() || 'DOC' }
  if (/^(xlsx?|csv|ods|numbers)$/.test(extension) || /spreadsheet|excel|csv/.test(mime)) return { kind: 'spreadsheet', label: "ui.spreadsheet", extension: extension.toUpperCase() || 'XLS' }
  if (/^(pptx?|odp|key)$/.test(extension) || /presentation|powerpoint/.test(mime)) return { kind: 'presentation', label: "ui.presentation", extension: extension.toUpperCase() || 'PPT' }
  if (/^(zip|rar|7z|tar|gz|bz2|xz|tgz)$/.test(extension) || /zip|compressed|archive|tar/.test(mime)) return { kind: 'archive', label: "ui.archive", extension: extension.toUpperCase() || 'ZIP' }
  if (mime.startsWith('image/') || /^(png|jpe?g|gif|webp|svg|bmp|ico|heic)$/.test(extension)) return { kind: 'image', label: "ui.imageFile", extension: extension.toUpperCase() || 'IMG' }
  if (mime.startsWith('audio/') || /^(mp3|wav|flac|aac|m4a|ogg|wma)$/.test(extension)) return { kind: 'audio', label: "ui.audioFile", extension: extension.toUpperCase() || 'AUDIO' }
  if (mime.startsWith('video/') || /^(mp4|mov|avi|mkv|webm|wmv|m4v)$/.test(extension)) return { kind: 'video', label: "ui.videoFile", extension: extension.toUpperCase() || 'VIDEO' }
  if (/^(js|jsx|ts|tsx|vue|svelte|py|java|c|h|cpp|cc|cs|go|rs|php|rb|swift|kt|scala|sql|sh|bash|html|css|scss|less|json|yaml|yml|xml)$/.test(extension)) return { kind: 'code', label: "ui.codeFile", extension: extension.toUpperCase() || 'CODE' }
  if (mime.startsWith('text/') || /^(txt|md|log)$/.test(extension)) return { kind: 'text', label: "ui.textFile", extension: extension.toUpperCase() || 'TXT' }
  return { kind: 'file', label: "ui.attachment", extension: extension.toUpperCase().slice(0, 8) || 'FILE' }
}
