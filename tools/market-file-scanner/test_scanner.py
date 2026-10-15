import io
import unittest
import zipfile
from pypdf import PdfWriter
from scanner import validate, Rejected

def zipped(files):
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
        for name,data in files.items(): z.writestr(name,data)
    return output.getvalue()

class Tests(unittest.TestCase):
    def test_engineering(self):
        for data,name in [(b'ISO-10303-21;\nEND-ISO-10303-21;','part.step'),(b'solid a\nendsolid a','part.stl'),(b'(kicad_pcb (version 1))','board.kicad_pcb'),(b'plain notes','notes.txt')]:
            validate(data,name,'application/octet-stream')
    def test_mismatch_and_active(self):
        for data,name,mime in [(b'MZexecutable','part.step','application/octet-stream'),(b'<html>active</html>','notes.txt','text/plain'),(b'fake','picture.png','image/png'),(b'hello','code.py','text/plain')]:
            with self.assertRaises(Rejected): validate(data,name,mime)
    def test_archives(self):
        validate(zipped({'notes.txt':b'hello'}),'work.zip','application/zip')
        for files in [{'run.sh':b'echo danger'},{'../notes.txt':b'escape'},{'notes.txt':b'A'*1000000},{'nested.zip':zipped({'evil.html':b'<html>bad</html>'})}]:
            with self.assertRaises(Rejected): validate(zipped(files),'work.zip','application/zip')
    def test_document_relationships(self):
        validate(zipped({'word/document.xml':b'<document/>','[Content_Types].xml':b'<Types/>'}),'work.docx','application/octet-stream')
        with self.assertRaises(Rejected): validate(zipped({'word/document.xml':b'<document/>','_rels/.rels':b'<Relationship TargetMode="External"/>'}),'work.docx','application/octet-stream')
    def test_pdf(self):
        writer=PdfWriter();writer.add_blank_page(width=100,height=100);out=io.BytesIO();writer.write(out)
        validate(out.getvalue(),'work.pdf','application/pdf')
        writer.add_js('app.alert(1)');out=io.BytesIO();writer.write(out)
        with self.assertRaises(Rejected): validate(out.getvalue(),'work.pdf','application/pdf')
if __name__=='__main__':unittest.main()
