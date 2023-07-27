import pl from "tau-prolog";
const session = pl.create();
session.consult(
  `\
% The attachment ends in .txt. When I tried to open it as a PDF, my PDF reader threw an error.
% The email attachment is a txt file.
attachment_type(email_attachment, txt).

% The email attachment ends with .txt.
attachment_extension(email_attachment, '.txt').

% The PDF reader throws an error when trying to open a non-PDF file.
throws_error(PDF_reader, File) :-
    attachment_type(File, Type),
    not_attachment_type(File, pdf),
    Type \= pdf.
`,
  {
    success: function () {
      /* Program parsed correctly */

      session.query("attachment_type(email_attachment, txt).", {
        success: function (goal) {
          session.answer({
            success: function (answer) {
              console.log("ANSWER", pl.format_answer(answer));
            },
            error: function (err) {
              console.log(err);
              /* Uncaught error */
            },
            fail: function () {
              console.log("HERE");
              /* No more answers */
            },
            limit: function () {
              /* Limit exceeded */
            },
          });
        },
        error: function (err) {
          console.log(err);
          /* Error parsing goal */
        },
      });
    },
    error: function (err) {
      /* Error parsing program */
    },
  },
);
